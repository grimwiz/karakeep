import TurndownService from "turndown";

import { createKarakeepClient } from "@karakeep/sdk";

const addr = process.env.KARAKEEP_API_ADDR;
const apiKey = process.env.KARAKEEP_API_KEY;

export const karakeepClient = createKarakeepClient({
  baseUrl: `${addr}/api/v1`,
  headers: {
    "Content-Type": "application/json",
    authorization: `Bearer ${apiKey}`,
  },
});

export const turndownService = new TurndownService();
