/**
 * GET /api/admin/config - Get full config (admin)
 * PUT /api/admin/config - Update full config (admin)
 * No authentication required
 */

export async function onRequestGet({ request, env }) {
  const config = await env.CONFIG.get("menu-config", { type: "json" });
  if (!config) {
    return new Response(JSON.stringify({ error: "Config not found" }), { 
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  return Response.json(config, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" }
  });
}

export async function onRequestPut({ request, env }) {
  try {
    const config = await request.json();
    
    if (!config || !config.navigation || !config.sections) {
      return new Response(JSON.stringify({ error: "Invalid config structure" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    config.version = (config.version || 0) + 1;
    config.updatedAt = new Date().toISOString();

    await env.CONFIG.put("menu-config", JSON.stringify(config));

    return Response.json({ success: true, version: config.version });
  } catch (error) {
    console.error("Error updating config:", error);
    return new Response(JSON.stringify({ error: "Failed to update config" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}