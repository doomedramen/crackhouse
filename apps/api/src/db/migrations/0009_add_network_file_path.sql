-- Migration: Add file_path column to networks table
-- Date: 2026-02-22
-- This column stores the path to the HC22000 hash file for cracking

ALTER TABLE "networks" ADD COLUMN IF NOT EXISTS "file_path" varchar(1000);
