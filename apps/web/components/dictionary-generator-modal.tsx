"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { Switch } from "@workspace/ui/components/switch";
import { Separator } from "@workspace/ui/components/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
  Settings,
  ChevronDown,
  ChevronUp,
  FileText,
  Zap,
  AlertCircle,
  Database,
  Archive,
  Split,
} from "lucide-react";

interface DictionaryGeneratorModalProps {
  children: React.ReactNode;
}

interface GeneratorForm {
  minLen: string;
  maxLen: string;
  charsetType: "predefined" | "custom";
  charsetName: string;
  customCharset: string;
  pattern: string;
  usePattern: boolean;
  useWordlist: boolean;
  wordlist: string;
  usePadding: boolean;
  paddingChars: string;
  paddingPosition: "prefix" | "suffix" | "both";
  paddingCount: string;
  useLeetSpeak: boolean;
  startString: string;
  endString: string;
  maxDuplicates: string;
  useMaxDuplicates: boolean;
  outputFilename: string;
  splitBy: "none" | "lines" | "size";
  splitLines: string;
  splitSize: string;
  compression: "none" | "gzip" | "bzip2" | "lzma" | "7z";
  maxMemory: string;
  useMaxMemory: boolean;
}

const PREDEFINED_CHARSETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numeric: "0123456789",
  symbols: "!@#$%^&*()-_+=~`[]{}|:;\"'<>,./?",
  alphanumeric:
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  all: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_+=~`[]{}|:;\"'<>,./?",
};

export function DictionaryGeneratorModal({
  children,
}: DictionaryGeneratorModalProps) {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [form, setForm] = useState<GeneratorForm>({
    minLen: "8",
    maxLen: "63",
    charsetType: "predefined",
    charsetName: "lowercase",
    customCharset: "",
    pattern: "",
    usePattern: false,
    useWordlist: false,
    wordlist: "",
    usePadding: false,
    paddingChars: "!@#$%^&*",
    paddingPosition: "both",
    paddingCount: "1",
    useLeetSpeak: false,
    startString: "",
    endString: "",
    maxDuplicates: "2",
    useMaxDuplicates: false,
    outputFilename: "",
    splitBy: "none",
    splitLines: "1000000",
    splitSize: "100MB",
    compression: "none",
    maxMemory: "512MB",
    useMaxMemory: false,
  });

  const updateForm = (field: keyof GeneratorForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const getCurrentCharset = () => {
    if (form.charsetType === "predefined") {
      return (
        PREDEFINED_CHARSETS[
          form.charsetName as keyof typeof PREDEFINED_CHARSETS
        ] || ""
      );
    }
    return form.customCharset;
  };

  const generateLeetVariations = (word: string): string[] => {
    const leetMap = {
      a: ["4", "@"],
      e: ["3"],
      i: ["1", "!"],
      o: ["0"],
      s: ["5", "$"],
      t: ["7"],
      l: ["1"],
      g: ["6", "9"],
      b: ["8"],
      z: ["2"],
      c: ["("],
      A: ["4", "@"],
      E: ["3"],
      I: ["1", "!"],
      O: ["0"],
      S: ["5", "$"],
      T: ["7"],
      L: ["1"],
      G: ["6", "9"],
      B: ["8"],
      Z: ["2"],
      C: ["("],
    };

    const variations = new Set<string>();
    variations.add(word);

    const generateCombinations = (
      remainingChars: string[],
      currentWord: string,
      index: number = 0,
    ) => {
      if (index >= remainingChars.length) {
        variations.add(currentWord);
        return;
      }

      const char = remainingChars[index];

      // Keep original character
      generateCombinations(remainingChars, currentWord + char, index + 1);

      // Try leet substitutions
      if (leetMap[char as keyof typeof leetMap]) {
        for (const substitution of leetMap[char as keyof typeof leetMap]) {
          generateCombinations(
            remainingChars,
            currentWord + substitution,
            index + 1,
          );
        }
      }
    };

    generateCombinations(word.split(""), "");
    return Array.from(variations).sort();
  };

  const generateCommand = () => {
    const parts = ["crunch", form.minLen, form.maxLen];

    if (form.useWordlist && form.wordlist) {
      // Permutation mode - use wordlist with padding and leet speak
      const words = form.wordlist.split("\n").filter((word) => word.trim());

      let processedWords: string[] = [];

      if (form.useLeetSpeak) {
        // Generate leet variations for each word
        words.forEach((word) => {
          const variations = generateLeetVariations(word);
          processedWords = processedWords.concat(variations);
        });
        // Remove duplicates
        processedWords = [...new Set(processedWords)];
      } else {
        processedWords = words;
      }

      if (form.usePadding && form.paddingChars) {
        // Apply padding to each processed word and generate permutations
        const paddedWords = processedWords.map((word) => {
          const count = parseInt(form.paddingCount) || 1;
          const padding = form.paddingChars.slice(0, count);

          if (form.paddingPosition === "prefix") {
            return padding + word;
          } else if (form.paddingPosition === "suffix") {
            return word + padding;
          } else {
            // both
            return padding + word + padding;
          }
        });
        parts.push("-p", ...paddedWords);
      } else {
        parts.push("-p", ...processedWords);
      }
    } else if (form.usePattern && form.pattern) {
      // Pattern generation with padding
      if (form.usePadding && form.paddingChars) {
        // Modify pattern to include padding
        const count = parseInt(form.paddingCount) || 1;
        const paddingChars = form.paddingChars.slice(0, count);

        let modifiedPattern = form.pattern;
        if (form.paddingPosition === "prefix") {
          modifiedPattern = "^".repeat(count) + form.pattern;
        } else if (form.paddingPosition === "suffix") {
          modifiedPattern = form.pattern + "^".repeat(count);
        } else {
          // both
          modifiedPattern =
            "^".repeat(count) + form.pattern + "^".repeat(count);
        }
        parts.push("-t", modifiedPattern);
      } else {
        parts.push("-t", form.pattern);
      }
    } else {
      // Character set generation with padding
      let charset = getCurrentCharset();

      if (form.usePadding && form.paddingChars) {
        // Add padding characters to the charset
        charset = form.paddingChars + charset;
      }

      if (charset && form.charsetType === "custom") {
        parts.push(charset);
      } else if (
        form.charsetType === "predefined" &&
        form.charsetName !== "lowercase"
      ) {
        parts.push(charset);
      }
    }

    if (form.useMaxDuplicates && form.maxDuplicates) {
      parts.push("-d", form.maxDuplicates + "@");
    }

    if (form.startString) {
      parts.push("-s", form.startString);
    }

    if (form.endString) {
      parts.push("-e", form.endString);
    }

    if (form.outputFilename) {
      parts.push("-o", form.outputFilename);
    }

    if (form.splitBy === "lines" && form.splitLines) {
      parts.push("-c", form.splitLines);
    } else if (form.splitBy === "size" && form.splitSize) {
      parts.push("-b", form.splitSize);
    }

    if (form.compression !== "none") {
      parts.push("-z", form.compression);
    }

    if (form.useMaxMemory && form.maxMemory) {
      parts.push("-m", form.maxMemory);
    }

    return parts.join(" ");
  };

  const estimateSize = () => {
    if (form.useWordlist && form.wordlist) {
      // For wordlist permutation mode, estimate based on permutations
      const words = form.wordlist.split("\n").filter((word) => word.trim());
      if (words.length === 0) return "0 B";

      let processedWords: string[] = [];

      if (form.useLeetSpeak) {
        // Calculate leet variations
        words.forEach((word) => {
          const variations = generateLeetVariations(word);
          processedWords = processedWords.concat(variations);
        });
        // Remove duplicates
        processedWords = [...new Set(processedWords)];
      } else {
        processedWords = words;
      }

      // Calculate factorial of number of processed words
      let permutations = 1;
      for (let i = 2; i <= processedWords.length; i++) {
        permutations *= i;
      }

      const avgLength =
        processedWords.reduce((sum, word) => sum + word.length, 0) /
        processedWords.length;
      const estimatedBytes = permutations * avgLength;

      if (estimatedBytes < 1024) return `${estimatedBytes.toFixed(0)} B`;
      if (estimatedBytes < 1024 * 1024)
        return `${(estimatedBytes / 1024).toFixed(1)} KB`;
      if (estimatedBytes < 1024 * 1024 * 1024)
        return `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(estimatedBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } else {
      // Original calculation for character-based generation
      const min = parseInt(form.minLen) || 1;
      const max = parseInt(form.maxLen) || 1;
      const charset = getCurrentCharset();
      const charsetSize = charset.length;

      let totalCombinations = 0;
      for (let len = min; len <= max; len++) {
        totalCombinations += Math.pow(charsetSize, len);
      }

      const avgLength = (min + max) / 2;
      const estimatedBytes = totalCombinations * avgLength;

      if (estimatedBytes < 1024) return `${estimatedBytes.toFixed(0)} B`;
      if (estimatedBytes < 1024 * 1024)
        return `${(estimatedBytes / 1024).toFixed(1)} KB`;
      if (estimatedBytes < 1024 * 1024 * 1024)
        return `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(estimatedBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);

    try {
      // Simulate generation process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Close modal and reset form
      setOpen(false);
      setForm({
        minLen: "8",
        maxLen: "63",
        charsetType: "predefined",
        charsetName: "lowercase",
        customCharset: "",
        pattern: "",
        usePattern: false,
        useWordlist: false,
        wordlist: "",
        usePadding: false,
        paddingChars: "!@#$%^&*",
        paddingPosition: "both",
        paddingCount: "1",
        useLeetSpeak: false,
        startString: "",
        endString: "",
        maxDuplicates: "2",
        useMaxDuplicates: false,
        outputFilename: "",
        splitBy: "none",
        splitLines: "1000000",
        splitSize: "100MB",
        compression: "none",
        maxMemory: "512MB",
        useMaxMemory: false,
      });
    } catch (error) {
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="dictionary-generator-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono uppercase">
            <Zap className="h-5 w-5" />
            Dictionary Generator
          </DialogTitle>
          <DialogDescription className="font-mono">
            Generate WPA/WPA2 password dictionaries using the Crunch engine.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto space-y-6"
        >
          {/* Basic Settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase">
                Password Length (WPA/WPA2 Requirements)
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="minLen"
                    className="font-mono text-xs uppercase"
                  >
                    Minimum Length
                  </Label>
                  <Input
                    id="minLen"
                    type="number"
                    min="8"
                    max="63"
                    value={form.minLen}
                    onChange={(e) => updateForm("minLen", e.target.value)}
                    className="font-mono"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="maxLen"
                    className="font-mono text-xs uppercase"
                  >
                    Maximum Length
                  </Label>
                  <Input
                    id="maxLen"
                    type="number"
                    min="8"
                    max="63"
                    value={form.maxLen}
                    onChange={(e) => updateForm("maxLen", e.target.value)}
                    className="font-mono"
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                WPA/WPA2 passwords must be between 8-63 characters long
              </p>
            </div>

            {/* Generation Mode Selection */}
            <div className="space-y-4">
              <Label className="font-mono text-xs uppercase">
                Generation Mode
              </Label>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="useWordlist"
                    checked={form.useWordlist}
                    onCheckedChange={(checked) => {
                      updateForm("useWordlist", checked);
                      if (checked) {
                        updateForm("usePattern", false);
                      }
                    }}
                  />
                  <Label htmlFor="useWordlist" className="font-mono text-sm">
                    Use Wordlist Permutation
                  </Label>
                </div>

                {form.useWordlist && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="wordlist"
                      className="font-mono text-xs uppercase"
                    >
                      Enter Words (one per line)
                    </Label>
                    <Textarea
                      id="wordlist"
                      placeholder="password&#10;admin&#10;123456&#10;wifi&#10;network"
                      value={form.wordlist}
                      onChange={(e) => updateForm("wordlist", e.target.value)}
                      className="font-mono h-32"
                      required
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-mono">
                        Generate all permutations of the provided words. Perfect
                        for targeted WiFi password cracking.
                      </p>
                      {form.wordlist && (
                        <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                          {
                            form.wordlist
                              .split("\n")
                              .filter((word) => word.trim()).length
                          }{" "}
                          words
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* L33t Speak Option - only show when using wordlist */}
                {form.useWordlist && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="useLeetSpeak"
                        checked={form.useLeetSpeak}
                        onCheckedChange={(checked) =>
                          updateForm("useLeetSpeak", checked)
                        }
                      />
                      <Label
                        htmlFor="useLeetSpeak"
                        className="font-mono text-sm"
                      >
                        Generate L33t Speak Variations
                      </Label>
                    </div>

                    {form.useLeetSpeak && (
                      <div className="space-y-3 bg-muted/30 p-4 rounded-md">
                        <div className="p-3 bg-background rounded-md">
                          <p className="text-xs text-muted-foreground font-mono mb-2">
                            <strong>L33t Conversions:</strong>
                          </p>
                          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground font-mono">
                            <div>• a → 4, @</div>
                            <div>• e → 3</div>
                            <div>• i → 1, !</div>
                            <div>• o → 0</div>
                            <div>• s → 5, $</div>
                            <div>• t → 7</div>
                            <div>• l → 1</div>
                            <div>• g → 6, 9</div>
                            <div>• b → 8</div>
                          </div>
                        </div>

                        <div className="p-3 bg-background rounded-md">
                          <p className="text-xs text-muted-foreground font-mono mb-1">
                            <strong>Example - "apple":</strong>
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            apple, 4pple, 4pp1e, 4pp13, app13, 4ppl3, appl3,
                            etc.
                          </p>
                        </div>

                        {form.wordlist && (
                          <div className="p-3 bg-background rounded-md">
                            <p className="text-xs text-muted-foreground font-mono">
                              <strong>
                                Your words will generate approximately:
                              </strong>{" "}
                              {form.wordlist
                                .split("\n")
                                .filter((word) => word.trim())
                                .reduce((total, word) => {
                                  const variations =
                                    generateLeetVariations(word);
                                  return total + variations.length;
                                }, 0)}{" "}
                              variations
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!form.useWordlist && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="usePattern"
                      checked={form.usePattern}
                      onCheckedChange={(checked) =>
                        updateForm("usePattern", checked)
                      }
                    />
                    <Label htmlFor="usePattern" className="font-mono text-sm">
                      Use Pattern Generation
                    </Label>
                  </div>
                )}

                {form.usePattern && !form.useWordlist && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="pattern"
                      className="font-mono text-xs uppercase"
                    >
                      Pattern (@=lowercase, ^=uppercase, %=numeric, ^=symbol)
                    </Label>
                    <Input
                      id="pattern"
                      placeholder="@@@12"
                      value={form.pattern}
                      onChange={(e) => updateForm("pattern", e.target.value)}
                      className="font-mono"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Special Character Padding */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="usePadding"
                  checked={form.usePadding}
                  onCheckedChange={(checked) =>
                    updateForm("usePadding", checked)
                  }
                />
                <Label htmlFor="usePadding" className="font-mono text-sm">
                  Add Special Character Padding
                </Label>
              </div>

              {form.usePadding && (
                <div className="space-y-4 bg-muted/30 p-4 rounded-md">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="paddingChars"
                        className="font-mono text-xs uppercase"
                      >
                        Padding Characters
                      </Label>
                      <Input
                        id="paddingChars"
                        value={form.paddingChars}
                        onChange={(e) =>
                          updateForm("paddingChars", e.target.value)
                        }
                        className="font-mono"
                        placeholder="!@#$%^&*"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="paddingCount"
                        className="font-mono text-xs uppercase"
                      >
                        Number of Characters
                      </Label>
                      <Input
                        id="paddingCount"
                        type="number"
                        min="1"
                        max="3"
                        value={form.paddingCount}
                        onChange={(e) =>
                          updateForm("paddingCount", e.target.value)
                        }
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase">
                      Padding Position
                    </Label>
                    <Select
                      value={form.paddingPosition}
                      onValueChange={(value: "prefix" | "suffix" | "both") =>
                        updateForm("paddingPosition", value)
                      }
                    >
                      <SelectTrigger className="font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prefix">Prefix (Start)</SelectItem>
                        <SelectItem value="suffix">Suffix (End)</SelectItem>
                        <SelectItem value="both">
                          Both Prefix & Suffix
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="p-3 bg-background rounded-md">
                    <p className="text-xs text-muted-foreground font-mono">
                      <strong>Examples:</strong> If your word is "password" and
                      padding is "!":
                    </p>
                    <ul className="text-xs text-muted-foreground font-mono mt-1 space-y-1">
                      <li>• Prefix: !password</li>
                      <li>• Suffix: password!</li>
                      <li>• Both: !password!</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Character Set */}
            {!form.usePattern && !form.useWordlist && (
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase">
                  Character Set
                </Label>
                <Select
                  value={form.charsetType}
                  onValueChange={(value: "predefined" | "custom") =>
                    updateForm("charsetType", value)
                  }
                >
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="predefined">Predefined Set</SelectItem>
                    <SelectItem value="custom">Custom Set</SelectItem>
                  </SelectContent>
                </Select>

                {form.charsetType === "predefined" ? (
                  <Select
                    value={form.charsetName}
                    onValueChange={(value) => updateForm("charsetName", value)}
                  >
                    <SelectTrigger className="font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(PREDEFINED_CHARSETS).map((name) => (
                        <SelectItem key={name} value={name}>
                          {name.charAt(0).toUpperCase() + name.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2">
                    <Label
                      htmlFor="customCharset"
                      className="font-mono text-xs uppercase"
                    >
                      Custom Characters
                    </Label>
                    <Textarea
                      id="customCharset"
                      placeholder="Enter custom characters..."
                      value={form.customCharset}
                      onChange={(e) =>
                        updateForm("customCharset", e.target.value)
                      }
                      className="font-mono h-20"
                      required
                    />
                  </div>
                )}

                {form.charsetType === "predefined" && (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-xs font-mono text-muted-foreground">
                      Preview:
                    </p>
                    <p className="font-mono text-sm break-all">
                      {getCurrentCharset()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Estimated Size */}
            <div className="p-3 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono">
                  Estimated Size: {estimateSize()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                Command:{" "}
                <code className="bg-background px-1 rounded">
                  {generateCommand()}
                </code>
              </p>
            </div>
          </div>

          {/* Advanced Settings */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                type="button"
                className="w-full justify-between font-mono"
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Advanced Options
                </span>
                {advancedOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4">
              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="startString"
                    className="font-mono text-xs uppercase"
                  >
                    Start String
                  </Label>
                  <Input
                    id="startString"
                    placeholder="Start from..."
                    value={form.startString}
                    onChange={(e) => updateForm("startString", e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="endString"
                    className="font-mono text-xs uppercase"
                  >
                    End String
                  </Label>
                  <Input
                    id="endString"
                    placeholder="End at..."
                    value={form.endString}
                    onChange={(e) => updateForm("endString", e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="useMaxDuplicates"
                  checked={form.useMaxDuplicates}
                  onCheckedChange={(checked) =>
                    updateForm("useMaxDuplicates", checked)
                  }
                />
                <Label htmlFor="useMaxDuplicates" className="font-mono text-sm">
                  Limit Consecutive Duplicates
                </Label>
                {form.useMaxDuplicates && (
                  <Input
                    type="number"
                    min="1"
                    value={form.maxDuplicates}
                    onChange={(e) =>
                      updateForm("maxDuplicates", e.target.value)
                    }
                    className="w-20 font-mono h-8"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="outputFilename"
                  className="font-mono text-xs uppercase"
                >
                  Output Filename
                </Label>
                <Input
                  id="outputFilename"
                  placeholder="dictionary.txt"
                  value={form.outputFilename}
                  onChange={(e) => updateForm("outputFilename", e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase">
                  Split Output
                </Label>
                <Select
                  value={form.splitBy}
                  onValueChange={(value: "none" | "lines" | "size") =>
                    updateForm("splitBy", value)
                  }
                >
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Splitting</SelectItem>
                    <SelectItem value="lines">Split by Lines</SelectItem>
                    <SelectItem value="size">Split by Size</SelectItem>
                  </SelectContent>
                </Select>

                {form.splitBy === "lines" && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="splitLines"
                      className="font-mono text-xs uppercase"
                    >
                      Lines per File
                    </Label>
                    <Input
                      id="splitLines"
                      value={form.splitLines}
                      onChange={(e) => updateForm("splitLines", e.target.value)}
                      className="font-mono"
                    />
                  </div>
                )}

                {form.splitBy === "size" && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="splitSize"
                      className="font-mono text-xs uppercase"
                    >
                      Max File Size
                    </Label>
                    <Input
                      id="splitSize"
                      placeholder="100MB"
                      value={form.splitSize}
                      onChange={(e) => updateForm("splitSize", e.target.value)}
                      className="font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase">
                  Compression
                </Label>
                <Select
                  value={form.compression}
                  onValueChange={(
                    value: "none" | "gzip" | "bzip2" | "lzma" | "7z",
                  ) => updateForm("compression", value)}
                >
                  <SelectTrigger className="font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Compression</SelectItem>
                    <SelectItem value="gzip">Gzip</SelectItem>
                    <SelectItem value="bzip2">Bzip2</SelectItem>
                    <SelectItem value="lzma">LZMA</SelectItem>
                    <SelectItem value="7z">7-Zip</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="useMaxMemory"
                  checked={form.useMaxMemory}
                  onCheckedChange={(checked) =>
                    updateForm("useMaxMemory", checked)
                  }
                />
                <Label htmlFor="useMaxMemory" className="font-mono text-sm">
                  Limit Memory Usage
                </Label>
                {form.useMaxMemory && (
                  <Input
                    value={form.maxMemory}
                    onChange={(e) => updateForm("maxMemory", e.target.value)}
                    className="w-24 font-mono h-8"
                  />
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-md">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground font-mono">
              <p className="font-medium mb-1">Warning:</p>
              <p>
                Large dictionary generation can consume significant CPU time and
                disk space. Ensure you have adequate resources before starting
                generation.
              </p>
            </div>
          </div>
        </form>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            className="font-mono"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={isGenerating}
            className="font-mono"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Generate Dictionary
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
