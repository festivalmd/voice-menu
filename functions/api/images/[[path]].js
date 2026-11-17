/**
 * GET /api/images/* - Serve image from R2 (catch-all for nested paths)
 */
export async function onRequestGet({ request, env, params }) {
  // params.path contains the rest of the path after /api/images/
  const path = params.path;
  const key = Array.isArray(path) ? path.join('/') : path;
  
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