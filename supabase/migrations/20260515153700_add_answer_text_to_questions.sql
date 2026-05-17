ALTER TABLE public.generated_questions
ADD COLUMN IF NOT EXISTS answer_text text;
