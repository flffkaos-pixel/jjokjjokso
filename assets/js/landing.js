import { db, isConfigured } from "./db.js";
import { $, fmtNum, setupPage } from "./app.js";

setupPage();

async function loadStats() {
  if (!isConfigured()) return;
  try {
    const [{ count: posts }, { count: comments }] = await Promise.all([
      db.from("board_posts").select("id", { count: "exact", head: true }),
      db.from("board_comments").select("id", { count: "exact", head: true }),
    ]);
    $("#stat-posts").textContent = fmtNum(posts);
    $("#stat-comments").textContent = fmtNum(comments);
  } catch (err) {
    console.error(err);
  }
}

loadStats();
