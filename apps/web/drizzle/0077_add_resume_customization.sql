ALTER TABLE "user_resume"
  ADD COLUMN "latex_source" text;

ALTER TABLE "job_queue"
  ADD COLUMN "customized_r2_key" text,
  ADD COLUMN "customized_at" timestamp with time zone;
