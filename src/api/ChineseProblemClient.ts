import type { ContestQuestions, PastContests } from '@leetnotion/leetcode-api';
import type { AuthCookies } from '../auth/types';
import type { LeetCodeProblemDetail } from './LeetCodeClient';
import { throttledRequestUrl } from './requestUrlFetcher';
import { SessionExpiredError } from '../shared/errors';

export const LEETCODE_ORIGIN = 'https://leetcode.cn';

interface ProblemRow {
  questionFrontendId: string;
  title: string;
  originalTitle?: string;
  titleSlug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  status: 'ac' | 'notac' | null;
  acRate?: number;
  topicTags?: Array<{ name: string; slug: string }>;
}

interface ChineseListRow {
  frontendQuestionId: string;
  title: string;
  titleCn: string | null;
  titleSlug: string;
  difficulty: string;
  paidOnly: boolean;
  status: string | null;
  acRate?: number;
  topicTags?: Array<{ name: string; slug: string }>;
}

/** 中国站适配层：统一域名，并将中国站字段映射为现有业务模型。 */
export class ChineseProblemClient {
  constructor(private getCookies: () => AuthCookies | null) {}

  private headers(): Record<string, string> {
    const cookies = this.getCookies();
    return {
      'Content-Type': 'application/json', Origin: LEETCODE_ORIGIN, Referer: LEETCODE_ORIGIN + '/',
      ...(cookies ? {
        Cookie: `csrftoken=${cookies.csrftoken}; LEETCODE_SESSION=${cookies.LEETCODE_SESSION};`,
        'x-csrftoken': cookies.csrftoken,
      } : {}),
    };
  }

  private async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await throttledRequestUrl({
      url: LEETCODE_ORIGIN + '/graphql/', method: 'POST', headers: this.headers(),
      body: JSON.stringify({ query, variables }), throw: false,
    });
    if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
    const payload = response.json as { data?: T; errors?: Array<{ message?: string }> } | null;
    if (response.status !== 200 || !payload?.data || payload.errors?.length) {
      throw new Error('力扣中国站请求失败，请检查登录状态或稍后重试。');
    }
    return payload.data;
  }

  async whoami(): Promise<{ username: string; isSignedIn: boolean; isPremium: boolean } | null> {
    const data = await this.query<{ userStatus: { username: string; isSignedIn: boolean; isPremium: boolean } | null }>(
      'query { userStatus { username isSignedIn isPremium } }',
    );
    return data.userStatus;
  }

  async problem(slug: string): Promise<LeetCodeProblemDetail | null> {
    const data = await this.query<{ question: LeetCodeProblemDetail | null }>(
      `query ChineseProblem($slug: String!) {
        question(titleSlug: $slug) {
          questionId questionFrontendId title titleSlug translatedTitle content translatedContent
          difficulty isPaidOnly exampleTestcases metaData sampleTestCase
          codeSnippets { lang langSlug code } topicTags { name slug }
        }
      }`, { slug },
    );
    const q = data.question;
    if (!q?.questionFrontendId) return null;
    return { ...q, title: q.translatedTitle?.trim() || q.title,
      content: q.translatedContent?.trim() || q.content, translationCheckedAt: Date.now() };
  }

  async problems(options: { limit: number; offset: number }): Promise<{ questions: ProblemRow[]; total: number }> {
    const data = await this.query<{ problemsetQuestionList: { total: number; questions: ChineseListRow[] } }>(
      `query ChineseProblems($limit: Int!, $skip: Int!) {
        problemsetQuestionList(categorySlug: "", limit: $limit, skip: $skip, filters: {}) {
          total questions { frontendQuestionId title titleCn titleSlug difficulty paidOnly status acRate topicTags { name slug } }
        }
      }`, { limit: options.limit, skip: options.offset },
    );
    const page = data.problemsetQuestionList;
    if (!Array.isArray(page?.questions)) throw new Error('力扣中国站题库数据格式异常。');
    return {
      total: page.total,
      questions: page.questions.map(q => ({
        questionFrontendId: q.frontendQuestionId,
        title: q.titleCn?.trim() || q.title, originalTitle: q.title, titleSlug: q.titleSlug,
        difficulty: q.difficulty.toUpperCase() === 'EASY' ? 'Easy' : q.difficulty.toUpperCase() === 'HARD' ? 'Hard' : 'Medium',
        isPaidOnly: q.paidOnly,
        status: ['AC', 'SOLVED'].includes(q.status?.toUpperCase() ?? '') ? 'ac'
          : ['NOTAC', 'TRIED', 'ATTEMPTED'].includes(q.status?.toUpperCase() ?? '') ? 'notac' : null,
        acRate: typeof q.acRate === 'number' ? q.acRate * 100 : undefined,
        topicTags: q.topicTags,
      })),
    };
  }

  async getPastContests({ limit = 30, skip = 0 }: { limit?: number; skip?: number } = {}): Promise<PastContests> {
    const data = await this.query<{ contestV2HistoryContests: PastContests }>(
      `query ChineseContests($skip: Int!, $limit: Int!) {
        contestV2HistoryContests(skip: $skip, limit: $limit) {
          totalNum contests { titleSlug title titleCn startTime duration cardImg cardImgApp companyWatermark solved totalQuestions }
        }
      }`, { skip, limit },
    );
    const result = data.contestV2HistoryContests;
    return { ...result, contests: result.contests.map(contest => ({
      ...contest, title: contest.titleCn?.trim() || contest.title,
    })) };
  }

  async getContestQuestions(slug: string): Promise<ContestQuestions> {
    if (!/^(weekly|biweekly)-contest-\d+$/.test(slug)) throw new Error('竞赛标识无效。');
    const response = await throttledRequestUrl({
      url: `${LEETCODE_ORIGIN}/contest/api/info/${slug}/`, method: 'GET', headers: this.headers(), throw: false,
    });
    if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
    const data = response.json as ContestQuestions | null;
    if (response.status !== 200 || !Array.isArray(data?.questions)) throw new Error('获取中国站竞赛题目失败。');
    return data;
  }
}
