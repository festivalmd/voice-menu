/**
 * DELETE /api/admin/images/:id - Delete image from R2
 * No authentication required
 */

export async function onRequestDelete({ params, request, env }) {
  try {
    const { id } = params;
    
    if (!id) {
      return new Response(JSON.stringify({ error: "Image ID required" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    await env.IMAGES.delete(id);

    return Response.json({ success: true, deleted: id });
  } catch (error) {
    console.error("Delete error:", error);
    return new Response(JSON.stringify({ error: "Failed to delete image" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}