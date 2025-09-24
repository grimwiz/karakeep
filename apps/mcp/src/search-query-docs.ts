export const SEARCH_QUERY_LANGUAGE_DESCRIPTION = `
Search bookmarks using Karakeep's query language. Combine free text terms with structured qualifiers to narrow results.

Supported qualifiers include:
- \`is:fav\`, \`is:archived\`, \`is:tagged\`, \`is:inlist\` for bookmark state
- \`is:link\`, \`is:text\`, \`is:media\` to filter by bookmark type
- \`url:<value>\` and \`title:<value>\` for substring matches (wrap multi-word values in double quotes)
- \`#<tag>\` to match tags (supports double-quoted tag names with spaces)
- \`list:<name>\` to target a list by name (exclude the icon; double quotes support spaces)
- \`after:<YYYY-MM-DD>\` / \`before:<YYYY-MM-DD>\` to filter by creation date
- \`feed:<name>\` to locate bookmarks imported from a feed
- \`age:<comparison><value>\` to filter by relative age (use \`<\` or \`>\` with units \`d\`, \`w\`, \`m\`, or \`y\`)

Prefix any qualifier with \`-\` to negate it. Combine multiple clauses with implicit AND, or use the explicit \`and\` / \`or\` keywords and parentheses for grouping when building complex queries.

Example queries:
- \`is:fav after:2023-01-01 before:2023-12-31 #important\`
- \`is:archived and (list:reading or #work)\`
- \`machine learning is:fav\`
`;
