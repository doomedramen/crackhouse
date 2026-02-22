import { db } from "@/db";
import { dictionaries } from "@/db/schema";
import { env } from "@/config/env";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { getWebSocketServer } from "@/lib/websocket";
import { logger } from "@/lib/logger";

interface GenerateDictionaryOptions {
  name: string;
  baseWords?: string[];
  rules?: string[];
  transformations?: string[];
  userId: string;
}

// Helper function to broadcast dictionary generation progress
async function broadcastDictionaryProgress(
  dictionaryId: string,
  progress: number,
  stage: string,
  metadata?: any,
): Promise<void> {
  try {
    const wsServer = getWebSocketServer();

    wsServer.broadcastJobUpdate({
      id: dictionaryId,
      status: "running",
      progress,
      metadata: {
        type: "dictionary_generation",
        stage,
        ...metadata,
      },
    });
  } catch (error) {
    // Log but don't fail the operation if WebSocket fails
    logger.warn("Failed to broadcast dictionary progress", "dictionary-generation", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export async function generateDictionary({
  name,
  baseWords = [],
  rules = [],
  transformations = [],
  userId,
}: GenerateDictionaryOptions) {
  try {
    // Create temporary working directory
    const workDir = path.join(
      process.cwd(),
      "temp",
      "dict-generation",
      crypto.randomUUID(),
    );
    await fs.mkdir(workDir, { recursive: true });

    // Broadcast initial progress
    await broadcastDictionaryProgress(name, 5, "initializing", {
      baseWordsCount: baseWords.length,
      rulesCount: rules.length,
      transformationsCount: transformations.length,
    });

    // Generate the dictionary content
    await broadcastDictionaryProgress(name, 25, "generating_content");

    const dictionaryContent = await createDictionaryContent({
      baseWords,
      rules,
      transformations,
      workDir,
    });

    // Broadcast content generation complete
    await broadcastDictionaryProgress(name, 75, "writing_file");

    // Generate unique filename
    const fileHash = crypto
      .createHash("sha256")
      .update(dictionaryContent)
      .digest("hex");
    const filename = `${fileHash}-${name.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
    const filePath = path.join(
      process.cwd(),
      env.UPLOAD_DIR,
      "dictionaries",
      filename,
    );

    // Ensure dictionary directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write dictionary to file
    await fs.writeFile(filePath, dictionaryContent, "utf-8");

    // Count words in generated dictionary
    const wordCount = dictionaryContent
      .split("\n")
      .filter((line) => line.trim()).length;

    // Save dictionary to database
    const [newDictionary] = await db
      .insert(dictionaries)
      .values({
        name,
        filename,
        type: "generated",
        status: "ready",
        size: dictionaryContent.length,
        wordCount,
        encoding: "utf-8",
        checksum: fileHash,
        filePath,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Broadcast completion
    await broadcastDictionaryProgress(name, 100, "completed", {
      wordCount,
      size: dictionaryContent.length,
      dictionaryId: newDictionary.id,
    });

    // Cleanup temporary directory
    await fs.rm(workDir, { recursive: true, force: true });

    return newDictionary;
  } catch (error) {
    // Broadcast error
    await broadcastDictionaryProgress(name, 0, "failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    throw new Error(
      `Dictionary generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

async function createDictionaryContent({
  baseWords,
  rules,
  transformations,
  workDir,
}: {
  baseWords: string[];
  rules: string[];
  transformations: string[];
  workDir: string;
}) {
  let words = new Set<string>();

  // Add base words
  baseWords.forEach((word) => words.add(word));

  // Apply common transformations if no custom rules provided
  if (rules.length === 0 && transformations.length === 0) {
    rules = getCommonTransformationRules();
  }

  // Apply custom transformations
  if (transformations.length > 0) {
    const transformedWords = await applyCustomTransformations(
      baseWords,
      transformations,
      workDir,
    );
    transformedWords.forEach((word) => words.add(word));
  }

  // Apply hashcat-style rules if provided
  if (rules.length > 0) {
    const ruleWords = await applyHashcatRules(baseWords, rules, workDir);
    ruleWords.forEach((word) => words.add(word));
  }

  // Add common password patterns
  const commonPatterns = generateCommonPatterns(baseWords);
  commonPatterns.forEach((word) => words.add(word));

  // Convert to array and remove duplicates while preserving order
  const uniqueWords = Array.from(words).filter((word) => word.length > 0);

  // Join with newlines
  return uniqueWords.join("\n");
}

function getCommonTransformationRules(): string[] {
  return [
    // Common hashcat rules for password cracking
    ":", // No change
    "u", // Uppercase all letters
    "l", // Lowercase all letters
    "c", // Capitalize first letter
    "C", // Lowercase first letter
    "t", // Toggle case of all letters
    "r", // Reverse word
    "d", // Duplicate word
    "p", // Duplicate first character
    "f", // Duplicate last character
    "{", // Rotate left
    "}", // Rotate right
    "$1", // Append '1'
    "$2", // Append '2'
    "$3", // Append '3'
    "$2023", // Append '2023'
    "$2024", // Append '2024'
    "$!", // Append '!'
    "$@", // Append '@'
    "$#", // Append '#'
    "1$", // Prepend '1'
    "2$", // Prepend '2'
    "^1", // Prepend '1'
    "^!", // Prepend '!'
    "^@", // Prepend '@'
  ];
}

async function applyCustomTransformations(
  words: string[],
  transformations: string[],
  workDir: string,
): Promise<string[]> {
  const transformedWords: string[] = [];

  for (const word of words) {
    for (const transformation of transformations) {
      try {
        // Apply basic string transformations
        const transformed = applyBasicTransformation(word, transformation);
        if (transformed && transformed !== word) {
          transformedWords.push(transformed);
        }
      } catch (error) {
        logger.warn("Error applying transformation", "dictionary-generation", {
          transformation,
          word,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }

  return transformedWords;
}

function applyBasicTransformation(
  word: string,
  transformation: string,
): string {
  const transformations: Record<string, (w: string) => string> = {
    upper: (w) => w.toUpperCase(),
    lower: (w) => w.toLowerCase(),
    capitalize: (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    reverse: (w) => w.split("").reverse().join(""),
    leet: (w) =>
      w.replace(/[eaos]/gi, (match) => {
        const leetMap: Record<string, string> = {
          e: "3",
          E: "3",
          a: "4",
          A: "4",
          o: "0",
          O: "0",
          s: "5",
          S: "5",
        };
        return leetMap[match] || match;
      }),
    duplicate: (w) => w + w,
    append_year: (w) => w + "2024",
    append_1: (w) => w + "1",
    prepend_1: (w) => "1" + w,
  };

  return transformations[transformation]?.(word) || word;
}

async function applyHashcatRules(
  words: string[],
  rules: string[],
  workDir: string,
): Promise<string[]> {
  const ruleWords: string[] = [];

  // For now, implement basic hashcat-style rules
  // In production, you might use a library like 'hashcat-js' or similar

  for (const word of words) {
    for (const rule of rules) {
      const transformed = applyHashcatRule(word, rule);
      if (transformed && transformed !== word) {
        ruleWords.push(transformed);
      }
    }
  }

  return ruleWords;
}

function applyHashcatRule(word: string, rule: string): string {
  let result = word;

  // Parse basic hashcat rules
  for (let i = 0; i < rule.length; i++) {
    const char = rule[i];

    switch (char) {
      case ":":
        // No change
        break;
      case "u":
        result = result.toUpperCase();
        break;
      case "l":
        result = result.toLowerCase();
        break;
      case "c":
        result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
        break;
      case "C":
        result = result.charAt(0).toLowerCase() + result.slice(1);
        break;
      case "t":
        result = result
          .split("")
          .map((c) =>
            c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase(),
          )
          .join("");
        break;
      case "r":
        result = result.split("").reverse().join("");
        break;
      case "d":
        result = result + result;
        break;
      case "p":
        result = result.charAt(0) + result;
        break;
      case "f":
        result = result + result.charAt(result.length - 1);
        break;
      case "{":
        result = result.slice(1) + result.charAt(0);
        break;
      case "}":
        result = result.charAt(result.length - 1) + result.slice(0, -1);
        break;
      case "$":
        // Append characters
        const appendMatch = rule.slice(i + 1).match(/^([^\s]+)/);
        if (appendMatch) {
          result += appendMatch[1];
          i += appendMatch[1].length;
        }
        break;
      case "^":
        // Prepend characters
        const prependMatch = rule.slice(i + 1).match(/^([^\s]+)/);
        if (prependMatch) {
          result = prependMatch[1] + result;
          i += prependMatch[1].length;
        }
        break;
      default:
        // Unknown rule character, skip
        break;
    }
  }

  return result;
}

function generateCommonPatterns(baseWords: string[]): string[] {
  const patterns: string[] = [];

  // Generate common password patterns based on base words
  baseWords.forEach((word) => {
    if (word.length < 3) return;

    // Common years
    const years = ["2023", "2024", "2025", "123", "1234", "12345"];
    years.forEach((year) => {
      patterns.push(word + year);
      patterns.push(year + word);
    });

    // Common symbols
    const symbols = ["!", "@", "#", "$", "%", "&", "*", "?"];
    symbols.forEach((symbol) => {
      patterns.push(word + symbol);
      patterns.push(symbol + word);
      patterns.push(word + word + symbol);
      patterns.push(symbol + word + word);
    });

    // Common combinations
    patterns.push(word + "123");
    patterns.push("123" + word);
    patterns.push(word + "1");
    patterns.push("1" + word);
    patterns.push(word + "!");
    patterns.push("!" + word);
  });

  return patterns;
}

// Default word lists for generation
export const defaultWordLists = {
  commonPasswords: [
    "password",
    "123456",
    "123456789",
    "guest",
    "qwerty",
    "admin",
    "letmein",
    "welcome",
    "monkey",
    "dragon",
    "master",
    "sunshine",
  ],
  commonWords: [
    "love",
    "home",
    "family",
    "happy",
    "summer",
    "winter",
    "spring",
    "autumn",
    "football",
    "baseball",
    "soccer",
    "computer",
    "internet",
  ],
  numbers: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  months: [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ],
};
