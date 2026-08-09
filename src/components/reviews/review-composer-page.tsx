import { ReviewComposer } from "@/components/reviews/review-composer";
import { getReviewEvidence } from "@/features/reviews/evidence";
import { EMPTY_REVIEW_STRUCTURED_DATA } from "@/features/reviews/formatting";
import { getCurrentReview } from "@/features/reviews/queries";

export async function ReviewComposerPage({ type }: { type: "daily" | "weekly" }) {
  const now = new Date();
  const [evidence, current] = await Promise.all([
    getReviewEvidence({ type, now }),
    getCurrentReview(type, now),
  ]);
  return (
    <ReviewComposer
      type={type}
      evidence={evidence}
      initialValue={current.review?.structured_data ?? EMPTY_REVIEW_STRUCTURED_DATA}
      existingReviewId={current.review?.id}
    />
  );
}
