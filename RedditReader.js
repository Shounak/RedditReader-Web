javascript:(async()=>{
  try {
    function makeJsonUrl(pageUrl) {
      var u = new URL(pageUrl);
      u.hash = "";
      u.search = "";

      var path = u.pathname.replace(/\/+$/, "");

      if (!/\.json$/i.test(path)) {
        path += ".json";
      }

      u.pathname = path;
      u.search = "limit=500&raw_json=1";
      return u.toString();
    }

    function escapeHtml(value) {
      var div = document.createElement("div");
      div.textContent = String(value == null ? "" : value);
      return div.innerHTML;
    }

    function decodeHtmlEntities(value) {
      var textarea = document.createElement("textarea");
      textarea.innerHTML = String(value == null ? "" : value);
      return textarea.value;
    }

    function renderText(value) {
      return "<span class='plain-text'>" + escapeHtml(value || "") + "</span>";
    }

    function renderRedditHtml(htmlValue, fallbackText) {
      if (htmlValue) {
        var decoded = String(htmlValue);

        // raw_json=1 usually gives real HTML already.
        // Without raw_json=1, Reddit may give entity-escaped HTML.
        if (decoded.indexOf("&lt;") !== -1 || decoded.indexOf("&gt;") !== -1) {
          decoded = decodeHtmlEntities(decoded);
        }

        decoded = decoded
          .replace(/<!-- SC_OFF -->/g, "")
          .replace(/<!-- SC_ON -->/g, "");

        return decoded;
      }

      return renderText(fallbackText || "");
    }

    function timeAgoFromUtcSeconds(utcSeconds) {
      if (utcSeconds == null || utcSeconds === "") {
        return "";
      }

      var seconds = Math.floor(Date.now() / 1000 - Number(utcSeconds));

      if (!isFinite(seconds)) {
        return "";
      }

      if (seconds < 0) {
        seconds = 0;
      }

      var minute = 60;
      var hour = 60 * minute;
      var day = 24 * hour;
      var month = 30 * day;
      var year = 365 * day;

      if (seconds < 45) return "just now";
      if (seconds < 90) return "1 minute ago";
      if (seconds < hour) return Math.floor(seconds / minute) + " minutes ago";
      if (seconds < 90 * minute) return "1 hour ago";
      if (seconds < day) return Math.floor(seconds / hour) + " hours ago";
      if (seconds < 2 * day) return "1 day ago";
      if (seconds < month) return Math.floor(seconds / day) + " days ago";
      if (seconds < 2 * month) return "1 month ago";
      if (seconds < year) return Math.floor(seconds / month) + " months ago";
      if (seconds < 2 * year) return "1 year ago";

      return Math.floor(seconds / year) + " years ago";
    }

    function renderComment(node, depth) {
      if (renderedCount >= MAX_COMMENTS) {
        return "";
      }

      if (!node || node.kind !== "t1") {
        return "";
      }

      renderedCount += 1;

      var d = node.data || {};
      var margin = Math.min(depth * 14, 84);

      var score = d.score;
      if (score == null) score = d.ups;
      if (score == null) score = "";

      var age = timeAgoFromUtcSeconds(d.created_utc || d.created);

      var html = "";
      html += "<div class='comment' style='margin-left:" + margin + "px;'>";
      html += "<div class='comment-meta'>";
      html += "▲ " + escapeHtml(score);
      html += " · u/" + escapeHtml(d.author || "[unknown]");

      if (age) {
        html += " · " + escapeHtml(age);
      }

      if (d.is_submitter) {
        html += " · OP";
      }

      if (d.edited && d.edited !== true) {
        var editedAge = timeAgoFromUtcSeconds(d.edited);
        html += " · edited" + (editedAge ? " " + escapeHtml(editedAge) : "");
      } else if (d.edited === true) {
        html += " · edited";
      }

      html += "</div>";
      html += "<div class='md comment-body'>" + renderRedditHtml(d.body_html, d.body || "") + "</div>";
      html += "</div>";

      var replies = d.replies;
      if (replies && replies.data && replies.data.children) {
        var children = replies.data.children;
        for (var i = 0; i < children.length; i++) {
          html += renderComment(children[i], depth + 1);
        }
      }

      return html;
    }

    var jsonUrl = makeJsonUrl(location.href);

    var response = await fetch(jsonUrl, {
      credentials: "include",
      headers: {
        "Accept": "application/json,text/plain,*/*"
      }
    });

    if (!response.ok) {
      throw new Error("Reddit JSON request failed: HTTP " + response.status);
    }

    var data = await response.json();

    if (!Array.isArray(data) || !data[0] || !data[1]) {
      throw new Error("Unexpected Reddit JSON shape.");
    }

    var postListing = data[0];
    var commentsListing = data[1];

    var post = postListing.data.children[0].data;
    var comments = commentsListing.data.children || [];

    var renderedCount = 0;
    var MAX_COMMENTS = 800;

    var postAge = timeAgoFromUtcSeconds(post.created_utc || post.created);
    var postBodyHtml = post.selftext_html || "";
    var postBody = post.selftext || post.url || "";

    var commentsHtml = "";

    for (var i = 0; i < comments.length; i++) {
      commentsHtml += renderComment(comments[i], 0);
    }

    if (renderedCount >= MAX_COMMENTS) {
      commentsHtml += "<p><em>Stopped after " + MAX_COMMENTS + " comments.</em></p>";
    }

    var html = "";
    html += "<!doctype html>";
    html += "<html>";
    html += "<head>";
    html += "<meta charset='utf-8'>";
    html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
    html += "<title>" + escapeHtml(post.title || "Reddit Reader") + "</title>";
    html += "<style>";
    html += "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.45;padding:18px;max-width:820px;margin:auto;color:#111;background:#fff;}";
    html += "h1{font-size:1.45rem;line-height:1.25;margin:0 0 .6rem 0;}";
    html += "h2{font-size:1.15rem;margin-top:1.4rem;}";
    html += "hr{border:0;border-top:1px solid #ddd;margin:20px 0;}";
    html += ".meta{color:#666;font-size:.9rem;margin-bottom:1rem;}";
    html += ".post{margin-bottom:1.5rem;}";
    html += ".comment{border-left:3px solid #ddd;padding-left:10px;margin-top:12px;margin-bottom:12px;}";
    html += ".comment-meta{color:#666;font-size:.85rem;margin-bottom:4px;}";
    html += ".comment-body{font-size:.98rem;}";
    html += ".plain-text{white-space:pre-wrap;}";
    html += "a{color:#0645ad;word-break:break-word;}";
    html += ".md p{margin:.45em 0;}";
    html += ".md blockquote{border-left:3px solid #ccc;margin:.6em 0;padding-left:10px;color:#555;}";
    html += ".md pre{background:#f6f6f6;padding:10px;overflow:auto;border-radius:6px;}";
    html += ".md code{background:#f6f6f6;padding:1px 4px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}";
    html += ".md pre code{padding:0;background:transparent;}";
    html += ".md ul,.md ol{padding-left:1.4em;}";
    html += "img{max-width:100%;height:auto;border-radius:6px;}";
    html += ".source-link{font-size:.9rem;margin-top:.75rem;}";
    html += "</style>";
    html += "</head>";
    html += "<body>";

    html += "<h1>" + escapeHtml(post.title || "Untitled Reddit post") + "</h1>";

    html += "<div class='meta'>";
    html += escapeHtml(post.subreddit_name_prefixed || "");
    html += " · u/" + escapeHtml(post.author || "[unknown]");
    html += " · ▲ " + escapeHtml(post.score == null ? "" : post.score);

    if (postAge) {
      html += " · " + escapeHtml(postAge);
    }

    html += " · " + escapeHtml(post.num_comments == null ? "" : post.num_comments) + " comments";
    html += "</div>";

    html += "<div class='md post'>" + renderRedditHtml(postBodyHtml, postBody) + "</div>";

    html += "<hr>";
    html += "<h2>Comments</h2>";
    html += commentsHtml || "<p>No comments found.</p>";

    html += "</body>";
    html += "</html>";

    document.open();
    document.write(html);
    document.close();
  } catch (err) {
    alert("Reddit Reader failed: " + (err && err.message ? err.message : err));
  }
})();
