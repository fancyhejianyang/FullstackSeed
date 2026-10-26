import { NETEASE_NEWS_API_URL } from "./hotTopic";

export const DOUYIN_HOT_API_URL =
  "https://www.douyin.com/aweme/v1/web/hot/search/list/";

/** Fixed public sources cannot be switched to a user-supplied page or AI search. */
export function fixedHotSourceUrl(kind: string): string | null {
  if (kind === "douyinHot") return DOUYIN_HOT_API_URL;
  if (kind === "neteaseNews") return NETEASE_NEWS_API_URL;
  return null;
}
