"use client";

import React, { useState } from "react";
import { useDictionaryTemplates, useGenerateDictionary } from "@/lib/api-hooks";
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
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Plus,
  BookOpen,
  Wand2,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Hash,
  Clock,
} from "lucide-react";

interface DictionaryGenerationModalProps {
  children: React.ReactNode;
}

interface GenerationRule {
  id: string;
  rule: string;
  name: string;
  description: string;
}

interface Transformation {
  id: string;
  name: string;
  description: string;
}

export function DictionaryGenerationModal({
  children,
}: DictionaryGenerationModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseWords, setBaseWords] = useState("");
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [selectedTransformations, setSelectedTransformations] = useState<
    string[]
  >([]);
  const [useAsync, setUseAsync] = useState(true);
  const [activeTab, setActiveTab] = useState<"manual" | "templates">("manual");

  const { data: templates, isLoading: templatesLoading } =
    useDictionaryTemplates();
  const generateMutation = useGenerateDictionary();

  const isLoading = generateMutation.isPending;

  const handleGenerate = async () => {
    if (!name.trim()) {
      return;
    }

    const baseWordsArray = baseWords
      .split("\n")
      .map((word) => word.trim())
      .filter((word) => word.length > 0);

    try {
      await generateMutation.mutateAsync({
        name: name.trim(),
        baseWords: baseWordsArray.length > 0 ? baseWordsArray : undefined,
        rules: selectedRules.length > 0 ? selectedRules : undefined,
        transformations:
          selectedTransformations.length > 0
            ? selectedTransformations
            : undefined,
        async: useAsync,
      });

      // Reset form on success
      setName("");
      setBaseWords("");
      setSelectedRules([]);
      setSelectedTransformations([]);
      setUseAsync(true);
      setOpen(false);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const addTemplateWords = (templateWords: string[]) => {
    const currentWords = baseWords
      .split("\n")
      .map((word) => word.trim())
      .filter((word) => word.length > 0);

    const newWords = [...new Set([...currentWords, ...templateWords])];
    setBaseWords(newWords.join("\n"));
  };

  const addRule = (rule: string) => {
    if (!selectedRules.includes(rule)) {
      setSelectedRules([...selectedRules, rule]);
    }
  };

  const removeRule = (rule: string) => {
    setSelectedRules(selectedRules.filter((r) => r !== rule));
  };

  const addTransformation = (transformation: string) => {
    if (!selectedTransformations.includes(transformation)) {
      setSelectedTransformations([...selectedTransformations, transformation]);
    }
  };

  const removeTransformation = (transformation: string) => {
    setSelectedTransformations(
      selectedTransformations.filter((t) => t !== transformation),
    );
  };

  const getStatusIcon = () => {
    if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
    if (generateMutation.isSuccess)
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (generateMutation.isError)
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono uppercase">
            <Wand2 className="h-5 w-5" />
            Generate Dictionary
          </DialogTitle>
          <DialogDescription className="font-mono">
            Create custom dictionaries for password cracking with wordlists,
            rules, and transformations.
          </DialogDescription>
        </DialogHeader>

        {/* Status Message */}
        {(generateMutation.isSuccess || generateMutation.isError) && (
          <div
            className={`p-3 rounded-md flex items-center gap-2 ${
              generateMutation.isSuccess
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {getStatusIcon()}
            <span className="text-sm font-mono">
              {generateMutation.isSuccess
                ? "Dictionary generation started successfully!"
                : generateMutation.error?.message ||
                  "Failed to generate dictionary"}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex-1 py-2 px-4 font-mono text-sm border-b-2 transition-colors ${
              activeTab === "manual"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Manual Configuration
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`flex-1 py-2 px-4 font-mono text-sm border-b-2 transition-colors ${
              activeTab === "templates"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Templates & Presets
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === "manual" ? (
            <div className="space-y-6 p-6">
              {/* Dictionary Name */}
              <div className="space-y-2">
                <Label htmlFor="dictionary-name" className="font-mono text-sm">
                  Dictionary Name *
                </Label>
                <Input
                  id="dictionary-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Custom Dictionary"
                  className="font-mono"
                  disabled={isLoading}
                />
              </div>

              {/* Base Words */}
              <div className="space-y-2">
                <Label htmlFor="base-words" className="font-mono text-sm">
                  Base Words (one per line)
                </Label>
                <Textarea
                  id="base-words"
                  value={baseWords}
                  onChange={(e) => setBaseWords(e.target.value)}
                  placeholder="password&#10;admin&#10;123456&#10;welcome"
                  className="font-mono min-h-[120px]"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground font-mono">
                  Enter base words, one per line. Leave empty to use only
                  transformations and rules.
                </p>
              </div>

              {/* Hashcat Rules */}
              <div className="space-y-2">
                <Label className="font-mono text-sm">Hashcat Rules</Label>
                <div className="border rounded-md p-3 space-y-2">
                  {(templates as any)?.commonRules
                    ?.slice(0, 6)
                    .map((rule: GenerationRule) => (
                      <div
                        key={rule.rule}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`rule-${rule.rule}`}
                            checked={selectedRules.includes(rule.rule)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                addRule(rule.rule);
                              } else {
                                removeRule(rule.rule);
                              }
                            }}
                            disabled={isLoading}
                          />
                          <Label
                            htmlFor={`rule-${rule.rule}`}
                            className="text-sm font-mono cursor-pointer"
                          >
                            {rule.rule} - {rule.name}
                          </Label>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {rule.description}
                        </span>
                      </div>
                    ))}
                </div>
                {selectedRules.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedRules.map((rule) => (
                      <span
                        key={rule}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs font-mono rounded"
                      >
                        {rule}
                        <button
                          onClick={() => removeRule(rule)}
                          className="hover:text-primary/80"
                          disabled={isLoading}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Transformations */}
              <div className="space-y-2">
                <Label className="font-mono text-sm">Transformations</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(templates as any)?.transformations
                    ?.slice(0, 6)
                    .map((transformation: Transformation) => (
                      <div
                        key={transformation.id}
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          id={`trans-${transformation.id}`}
                          checked={selectedTransformations.includes(
                            transformation.id,
                          )}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              addTransformation(transformation.id);
                            } else {
                              removeTransformation(transformation.id);
                            }
                          }}
                          disabled={isLoading}
                        />
                        <Label
                          htmlFor={`trans-${transformation.id}`}
                          className="text-sm font-mono cursor-pointer"
                        >
                          {transformation.name}
                        </Label>
                      </div>
                    ))}
                </div>
                {selectedTransformations.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedTransformations.map((transformation) => (
                      <span
                        key={transformation}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-secondary/50 text-secondary-foreground text-xs font-mono rounded"
                      >
                        {transformation}
                        <button
                          onClick={() => removeTransformation(transformation)}
                          className="hover:text-secondary/80"
                          disabled={isLoading}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Processing Mode */}
              <div className="space-y-2">
                <Label className="font-mono text-sm">Processing Mode</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="async-mode"
                    checked={useAsync}
                    onCheckedChange={(checked) => setUseAsync(checked === true)}
                    disabled={isLoading}
                  />
                  <Label
                    htmlFor="async-mode"
                    className="text-sm font-mono cursor-pointer"
                  >
                    Asynchronous processing (recommended for large dictionaries)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {useAsync
                    ? "Dictionary will be generated in the background. You'll be notified when it's ready."
                    : "Dictionary will be generated immediately. Only available for smaller requests (≤1000 words)."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 p-6">
              {/* Template Word Lists */}
              <div className="space-y-3">
                <Label className="font-mono text-sm">
                  Predefined Word Lists
                </Label>
                <div className="grid gap-3">
                  {(templates as any)?.wordLists &&
                    Object.entries((templates as any).wordLists).map(
                      ([key, wordList]: [string, any]) => (
                        <div key={key} className="border rounded-md p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-mono font-medium">
                                {wordList.name}
                              </h4>
                              <p className="text-sm text-muted-foreground font-mono mt-1">
                                {wordList.description}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono mt-2">
                                {wordList.words.length} words
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addTemplateWords(wordList.words)}
                              disabled={isLoading}
                              className="font-mono"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </div>
                        </div>
                      ),
                    )}
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-3">
                <Label className="font-mono text-sm">Quick Presets</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedRules([":", "u", "l", "c", "r"]);
                      setSelectedTransformations(["append_year", "append_1"]);
                    }}
                    disabled={isLoading}
                    className="font-mono h-auto p-3 flex flex-col items-start"
                  >
                    <span className="font-medium">Common Variations</span>
                    <span className="text-xs text-muted-foreground">
                      Basic case changes + common patterns
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedRules([":", "d", "p", "f", "$1", "$!", "^1"]);
                      setSelectedTransformations(["leet", "duplicate"]);
                    }}
                    disabled={isLoading}
                    className="font-mono h-auto p-3 flex flex-col items-start"
                  >
                    <span className="font-medium">Advanced Patterns</span>
                    <span className="text-xs text-muted-foreground">
                      Complex transformations
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center p-6 border-t">
          <div className="text-sm text-muted-foreground font-mono">
            {baseWords.split("\n").filter((w) => w.trim()).length} base words •
            {selectedRules.length} rules •{selectedTransformations.length}{" "}
            transformations
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
              className="font-mono"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!name.trim() || isLoading}
              className="font-mono"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate Dictionary
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
