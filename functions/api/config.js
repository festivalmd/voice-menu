export async function onRequestGet({ env }) {
  const config = await env.CONFIG.get("menu-config", { type: "json" });
  if (!config) {
    return new Response(JSON.stringify({ error: "Config not found" }), { 
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  return Response.json(config, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    }
  });
}