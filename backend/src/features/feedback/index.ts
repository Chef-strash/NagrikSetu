// Feedback feature barrel. Each feature exposes its router here so `app.ts` can
// mount features without knowing their internals:
//
//   app.use("/api/v1", feedbackRouter);
//
// Add a new feature by creating `src/features/<name>/index.ts` that exports a
// router, then mounting it in `src/app.ts`.

export { feedbackRouter } from "./routes.ts";
export { getFaqAnswer, getFaqs, getReviews, submitReview } from "./service.ts";
export { validateReview } from "./review-input.ts";
export type * from "./types.ts";