export const demo = { group: "demo-group", groupName: "Fictional Friday Watch Club", anna: "demo-anna", max: "demo-max", invitation: "demo-invitation" };
export const titles = [
  { id: "demo-funny-24", title: "Fictional Funny Film", type: "movie", seconds: 1440, style: "none", moods: ["funny", "relaxing"], genres: ["Comedy"], contributors: [demo.anna, demo.max] },
  { id: "demo-funny-18", title: "Fictional Short Sketches", type: "youtube", seconds: 1080, style: "none", moods: ["funny"], genres: ["Comedy", "Short"], contributors: [demo.max] },
  { id: "demo-series", title: "Fictional Space Sitcom", type: "series", seconds: 1200, style: "season_episode", moods: ["exciting"], genres: ["Comedy", "Science fiction"], contributors: [demo.anna, demo.max] },
  { id: "demo-anime", title: "Fictional Quiet Quest", type: "anime", seconds: 1380, style: "continuous", moods: ["dark", "relaxing"], genres: ["Adventure", "Animation"], contributors: [demo.max] },
  { id: "demo-near", title: "Fictional Heartfelt Film", type: "movie", seconds: 1620, style: "none", moods: ["emotional"], genres: ["Drama"], contributors: [demo.anna] },
  { id: "demo-archive", title: "Fictional Archive Keepsake", type: "movie", seconds: 900, style: "none", moods: ["funny"], genres: ["Drama"], contributors: [], archived: true },
];
export function seedBaseline(db, tokenHash) {
  for (const table of ["metadata_reviews", "metadata_fields", "group_sessions", "progress", "ratings", "notes", "contributors", "title_genres", "title_moods", "titles", "invitations", "members", "groups"]) db.exec(`DELETE FROM ${table}`);
  db.prepare("INSERT INTO groups(id,name,created_at) VALUES (?,?,'2026-01-01T00:00:00.000Z')").run(demo.group, demo.groupName);
  for (const [index, id, name, color] of [[1, demo.anna, "Anna", "#1d4ed8"], [2, demo.max, "Max", "#0f766e"]]) db.prepare("INSERT INTO members(id,group_id,name,name_key,avatar_color,created_at) VALUES (?,?,?,?,?,?)").run(id, demo.group, name, name.toLowerCase(), color, `2026-01-01T00:0${index}:00.000Z`);
  db.prepare("INSERT INTO invitations(id,group_id,token_hash,created_at) VALUES (?,?,?,'2026-01-01T00:00:00.000Z')").run(demo.invitation, demo.group, tokenHash);
  for (const [index, item] of titles.entries()) {
    db.prepare("INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,archived,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(item.id, demo.group, item.title, item.title.toLowerCase(), item.type, item.seconds, item.style, item.archived ? 1 : 0, `2026-01-02T00:0${index}:00.000Z`);
    for (const mood of item.moods) db.prepare("INSERT INTO title_moods(title_id,mood_code) VALUES (?,?)").run(item.id, mood);
    for (const genre of item.genres) db.prepare("INSERT INTO title_genres(title_id,genre_key,label) VALUES (?,?,?)").run(item.id, genre.toLowerCase(), genre);
    for (const member of item.contributors) db.prepare("INSERT INTO contributors(group_id,title_id,member_id) VALUES (?,?,?)").run(demo.group, item.id, member);
    for (const [member, isAnna] of [[demo.anna, true], [demo.max, false]]) {
      const seasonal = item.style === "season_episode", continuous = item.style === "continuous";
      const episode = seasonal ? isAnna ? 3 : 7 : continuous ? isAnna ? 5 : 2 : null;
      const timestamp = item.style !== "none" ? null : item.id === "demo-funny-24" ? isAnna ? 600 : 120 : item.id === "demo-funny-18" ? isAnna ? 300 : 1080 : item.id === "demo-near" ? isAnna ? 60 : 1620 : isAnna ? 420 : 0;
      const complete = item.id === "demo-near" ? !isAnna : item.archived ? isAnna : false;
      db.prepare("INSERT INTO progress(group_id,title_id,member_id,numbering_style,position_state,next_season,next_episode,timestamp_seconds,completed) VALUES (?,?,?,?,?,?,?,?,?)").run(demo.group, item.id, member, item.style, item.style === "none" ? "unknown" : "in_progress", seasonal ? 1 : null, episode, timestamp, complete ? 1 : 0);
      db.prepare("INSERT INTO ratings(group_id,title_id,member_id,score) VALUES (?,?,?,?)").run(demo.group, item.id, member, isAnna ? 9 : 6);
      db.prepare("INSERT INTO notes(group_id,title_id,member_id,body) VALUES (?,?,?,?)").run(demo.group, item.id, member, `${isAnna ? "Anna" : "Max"}'s fictional ${item.archived ? "archived " : ""}note.\nA synthetic example, not provider metadata.`);
    }
  }
}
