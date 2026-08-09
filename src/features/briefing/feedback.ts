import type {
  BriefingFeedRefreshSummary,
  BriefingGenerationResult,
  BriefingGenerationState,
} from "./types";

export const initialBriefingGenerationState: BriefingGenerationState = {
  status: "idle",
  message: "",
  selected: null,
  candidateCount: null,
  feedsRefreshed: null,
  feedsFailed: null,
};

export function buildBriefingGenerationFeedback(
  refresh: BriefingFeedRefreshSummary,
  generation: BriefingGenerationResult | null,
): BriefingGenerationState {
  if (refresh.activeFeedCount === 0) {
    return {
      ...initialBriefingGenerationState,
      status: "warning",
      message: "还没有可用订阅源。请先在右侧添加 RSS / Atom 订阅，再生成今日简报。",
    };
  }

  if (!generation) {
    return {
      ...initialBriefingGenerationState,
      status: "error",
      message: "订阅源检查完成，但简报没有生成。请重试。",
      feedsRefreshed: refresh.feedsRefreshed,
      feedsFailed: refresh.feedsFailed,
    };
  }

  const common = {
    selected: generation.selected,
    candidateCount: generation.candidateCount,
    feedsRefreshed: refresh.feedsRefreshed,
    feedsFailed: refresh.feedsFailed,
  };

  if (generation.selected === 0) {
    if (refresh.feedsDue > 0 && refresh.feedsRefreshed === 0 && refresh.feedsFailed > 0) {
      return {
        ...common,
        status: "error",
        message: `没有生成可读条目：${refresh.feedsFailed} 个订阅源抓取失败。请展开“订阅源”查看状态后重试。`,
      };
    }

    const detail = generation.candidateCount
      ? `读取到 ${generation.candidateCount} 条候选资讯，但都未通过本次筛选。`
      : "近 96 小时没有读取到可用资讯。";
    return {
      ...common,
      status: "warning",
      message: `今日简报已完成，但没有可展示条目。${detail}`,
    };
  }

  const refreshDetail = refresh.feedsFailed
    ? `；另有 ${refresh.feedsFailed} 个订阅源抓取失败`
    : "";
  return {
    ...common,
    status: "success",
    message: `今日简报已生成 ${generation.selected} 条，结果已显示在本页下方${refreshDetail}。`,
  };
}
