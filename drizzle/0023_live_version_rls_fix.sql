-- 0022 ran empty on the hosted database (its statement sat on the comment line); this applies it. Running it twice is harmless.
ALTER TABLE "live_version" ENABLE ROW LEVEL SECURITY;
