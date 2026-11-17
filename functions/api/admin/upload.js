/**
 * POST /api/admin/upload - Upload image to R2
 * No authentication required
 */

export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sectionId = formData.get("sectionId");
    
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No file provided" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!sectionId) {
      return new Response(JSON.stringify({ error: "sectionId required" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!file.type.startsWith("image/")) {
      return new Response(JSON.stringify({ error: "Only image files allowed" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const ext = file.name.split(".").pop().toLowerCase();
    const timestamp = Date.now();
    const random = crypto.randomUUID().slice(0, 8);
    const key = `menu/${sectionId}/${timestamp}-${random}.${ext}`;

    await env.IMAGES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { 
        originalName: file.name,
        sectionId,
        uploadedAt: new Date().toISOString()
      }
    });

    const publicUrl = `/api/images/${key}`;
    
    return Response.json({ 
      success: true, 
      key, 
      url: publicUrl,
      fileName: file.name,
      size: file.size,
      type: file.type
    });
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({ error: "Failed to upload image" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}