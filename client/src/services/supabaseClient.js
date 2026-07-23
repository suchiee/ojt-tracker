import { createClient } from '@supabase/supabase-js';

// Dedicated Production Supabase Cloud Instance (AWS Mumbai: rzzftlekrrizjvvwsnat)
const supabaseUrl = 'https://rzzftlekrrizjvvwsnat.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6emZ0bGVrcnJpemp2dndzbmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDE2MDEsImV4cCI6MjEwMDM3NzYwMX0.3cYI_ziET6NYaQuudebEd7JH-Gg3D_gmM24V7fv-nSw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
