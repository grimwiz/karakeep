import type { Command } from "@commander-js/extra-typings";
import { getGlobalOptions } from "@/lib/globals";
import {
  printErrorMessageWithReason,
  printObject,
  printStatusMessage,
} from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";

type SynonymSuggestResult =
  | string[]
  | { suggestions: string[] }
  | undefined
  | null;

function normaliseSuggestions(result: SynonymSuggestResult): string[] {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result.suggestions)) {
    return result.suggestions;
  }

  return [];
}

function fallbackSuggestions(allTags: { name: string }[], tagName: string) {
  const needle = tagName.toLowerCase();
  const results = allTags
    .filter((tag) => tag.name.toLowerCase().includes(needle))
    .map((tag) => tag.name)
    .slice(0, 10);

  return Array.from(new Set(results));
}

export function registerSynonymSuggestCommand(tagsCmd: Command) {
  tagsCmd
    .command("synonym-suggest")
    .description("suggests tag synonyms for the provided tag name")
    .argument("<tag>", "the tag to get suggestions for")
    .action(async (tagName) => {
      const api = getAPIClient();

      try {
        const maybeSynonymSuggest = (
          api.tags as unknown as {
            synonymSuggest?: {
              query: (input: {
                tagName: string;
              }) => Promise<SynonymSuggestResult>;
            };
          }
        ).synonymSuggest;

        let suggestions: string[] = [];

        if (maybeSynonymSuggest) {
          const result = await maybeSynonymSuggest.query({ tagName });
          suggestions = normaliseSuggestions(result);
        }

        if (suggestions.length === 0) {
          const response = await api.tags.list.query();
          suggestions = fallbackSuggestions(response.tags, tagName);
        }

        if (getGlobalOptions().json) {
          printObject({ suggestions, tag: tagName });
          return;
        }

        if (suggestions.length === 0) {
          printStatusMessage(false, `No synonyms found for tag "${tagName}".`);
          return;
        }

        console.log(`Synonyms for tag "${tagName}":`);
        for (const suggestion of suggestions) {
          console.log(`- ${suggestion}`);
        }
      } catch (error) {
        printErrorMessageWithReason(
          `Failed to fetch synonyms for tag "${tagName}"`,
          error as object,
        );
      }
    });
}
