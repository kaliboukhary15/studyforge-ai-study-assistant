import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DocumentSchema = z.object({
  filename: z.string().min(1),
  storage_path: z.string().min(1),
  file_type: z.string().min(1),
  file_size: z.number().optional(),
});

export const createDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DocumentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        user_id: userId,
        filename: data.filename,
        storage_path: data.storage_path,
        file_type: data.file_type,
        file_size: data.file_size,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { document: doc };
  });

export const getDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { documents: data || [] };
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();

    if (error) throw new Error(error.message);
    return { document: doc };
  });

export const updateDocumentText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; extracted_text: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("documents")
      .update({ extracted_text: data.extracted_text })
      .eq("id", data.id)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; storage_path: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Delete from storage first
    const { error: storageError } = await supabase.storage
      .from("documents")
      .remove([data.storage_path]);

    if (storageError) console.error("Storage delete error:", storageError);

    // Delete from database
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    return { success: true };
  });
