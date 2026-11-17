/**
 * GET /api/images/:key - Serve image from R2 (works locally and in production)
 */
export async function onRequestGet({ request, env, params }) {
  const key = params.key;
  
  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const object = await env.IMAGES.get(key);
    
    if (!object) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    
    return new Response(object.body, { headers });
  } catch (error) {
    console.error("Image serve error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}