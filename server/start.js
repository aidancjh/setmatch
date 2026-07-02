// Entry-point selector for `npm start`. Railway's dashboard locks the
// "Custom Start Command" field once railway.json defines one, with no way to
// override it per-service from the UI — so both the consumer and admin
// Railway services must run the exact same `npm start`. This file picks
// which real server to boot based on the SERVICE env var (freely editable
// per-service in Railway's Variables tab, unlike the start command).
//
// Unset / anything else -> consumer app (server/index.js), unchanged default.
// SERVICE=admin           -> standalone admin service (server/admin-server.js).
if (process.env.SERVICE === "admin") {
  await import("./admin-server.js");
} else {
  await import("./index.js");
}
