// Readable Reddit Reader source. The bookmarklet will be packaged separately.
(async () => {
  try {
    // Build off-page so a fetch or rendering failure leaves the current page intact.
    const readerDocument = document.implementation.createHTMLDocument();

    function element(tag, text, className) {
      const node = readerDocument.createElement(tag);
      if (text != null) node.textContent = String(text);
      if (className) node.className = className;
      return node;
    }

    // Only Reddit's formatted bodies need HTML parsing; other content uses textContent.
    function renderBody(html, plainText, className) {
      const body = element("div", null, "md " + className);
      if (html) {
        let renderedHtml = String(html);
        if (renderedHtml.includes("&lt;") || renderedHtml.includes("&gt;")) {
          const decoder = element("textarea");
          decoder.innerHTML = renderedHtml;
          renderedHtml = decoder.value;
        }
        body.innerHTML = renderedHtml;
      } else {
        body.append(element("span", plainText || "", "plain-text"));
      }
      return body;
    }

    function renderPostUrl(postUrl) {
      const paragraph = element("p", null, "source-link");
      const link = element("a", postUrl);
      try {
        const url = new URL(postUrl, "https://www.reddit.com/");
        if (url.protocol === "https:" || url.protocol === "http:") {
          link.href = url.href;
          link.rel = "noreferrer noopener";
        }
      } catch {
        // Keep malformed URLs visible as text.
      }
      paragraph.append(link);
      return paragraph;
    }

    function formatRelativeTime(timestamp) {
      if (!Number.isFinite(Number(timestamp)) || !timestamp) return "";
      const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(timestamp)));
      for (const [unit, unitSeconds] of [
        ["year", 31536000],
        ["month", 2592000],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
      ]) {
        if (elapsedSeconds >= unitSeconds) {
          const count = Math.floor(elapsedSeconds / unitSeconds);
          return count + " " + unit + (count === 1 ? "" : "s") + " ago";
        }
      }
      return "just now";
    }

    // Share score-first metadata formatting, with extra fields for posts and comments.
    function renderMetadata(data, kind) {
      const isPost = kind === "post";
      const author = "u/" + (data.author || "[unknown]");
      const score = "▲ " + (data.score ?? (isPost ? "" : data.ups ?? ""));
      const fields = [score, author];
      fields.push(formatRelativeTime(data.created_utc || data.created));
      if (isPost) fields.push((data.num_comments ?? "") + " comments");
      else if (data.is_submitter) fields.push("OP");
      return element("div", fields.filter(Boolean).join(" · "), isPost ? "meta" : "comment-meta");
    }

    // Append comments in depth-first order, retaining the OP annotation.
    function renderComment(node, depth, root) {
      if (renderedCommentCount >= maxComments || !node || node.kind !== "t1") return;
      renderedCommentCount += 1;

      const comment = node.data || {};
      const container = element("div", null, "comment");
      container.style.marginLeft = Math.min(14 * depth, 84) + "px";
      container.append(
        renderMetadata(comment, "comment"),
        renderBody(comment.body_html, comment.body, "comment-body"),
      );
      root.append(container);

      const replies = comment.replies?.data?.children;
      if (Array.isArray(replies)) {
        for (const reply of replies) {
          if (renderedCommentCount >= maxComments) break;
          renderComment(reply, depth + 1, root);
        }
      }
    }

    // Fetch the same JSON endpoint, retaining the original test cookie assignment.
    const jsonUrl = new URL(location.href);
    // Note that using this cookie will log you in to this user - a real user with no data or activity
    document.cookie = "reddit_session=eyJhbGciOiJSUzI1NiIsImtpZCI6IlNIQTI1NjpsVFdYNlFVUEloWktaRG1rR0pVd1gvdWNFK01BSjBYRE12RU1kNzVxTXQ4IiwidHlwIjoiSldUIn0.eyJzdWIiOiJ0Ml8yb3ZoM3hkaXFvIiwiZXhwIjoxODA3NjYzNjMwLjcwNjE0LCJpYXQiOjE3OTIwMjUyMzAuNzA2MTQsImp0aSI6Im1jR0ZzWU5nNUlid0V5MnFRYl84ZjloMS0xS1d5USIsImF0IjoxLCJjaWQiOiJjb29raWUiLCJsY2EiOjE3OTIwMjQzNDAyOTIsInNjcCI6ImVKd0FBZ0Q5XzF0ZEF3QUJGUUM1IiwiZmxvIjoyLCJhbXIiOlsicHdkIl19.lUNsr9sqg_UWPOnxnngg3WnW5cdVMPN3V4ISnptWjnhUiqvGXIFPubXZnbWYpKDmrJsl9qjO4yMKj3ACqX4h5-RcieDjmU7AQKF8dxS3NbGkgLeEfXdsSb2drmWY9jA--wrQNVo7fONzE4-Xc3ng8rUwLDL8ReSQ8TWXvM12YVa0jAmxSlrnSYkaPyMm9o8-24qhZPfWNEjgqNG-IZ08rAw0O2lhDJe3aCu3WoiWvIUiP9CmoxLbE2JEKhiS2cNBAho-FZwH_ZHKond6mxPjagUTOYS0mCedYIBqHHO_bgYQlDEFALvKJPHY61Ilq3UWanBRTuT2rhYbn8NhFYNCLA;path=/;";
    jsonUrl.hash = "";
    const pathname = jsonUrl.pathname.replace(/\/+$/, "");
    jsonUrl.pathname = /\.json$/i.test(pathname) ? pathname : pathname + ".json";
    jsonUrl.search = "limit=500&raw_json=1";

    const response = await fetch(jsonUrl.toString(), {
      credentials: "include",
      headers: { Accept: "application/json,text/plain,*/*" },
    });
    if (!response.ok) {
      throw new Error("Reddit JSON request failed: HTTP " + response.status);
    }

    const payload = await response.json();
    const post = payload?.[0]?.data?.children?.[0]?.data;
    const commentNodes = payload?.[1]?.data?.children || [];
    if (!Array.isArray(payload) || !post || !payload[1] || !Array.isArray(commentNodes)) {
      throw new Error("Unexpected Reddit JSON shape.");
    }

    const styles = `body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.45;padding:18px;max-width:820px;margin:auto;color:#111;background:#fff}h1{font-size:1.45rem;line-height:1.25}h2{font-size:1.15rem;margin-top:1.4rem}hr{border:0;border-top:1px solid #ddd;margin:20px 0}.subreddit{color:#666}.meta{color:#666;font-size:.9rem;margin-bottom:1rem}.post{margin-bottom:1.5rem}.comment{border-left:3px solid #ddd;padding-left:10px;margin-top:12px;margin-bottom:12px}.comment-meta{color:#666;font-size:.85rem;margin-bottom:4px}.comment-body{font-size:.98rem}.plain-text{white-space:pre-wrap}a{color:#0645ad}.md p{margin:.45em 0}.md blockquote{border-left:3px solid #ccc;margin:.6em 0;padding-left:10px;color:#555}.md pre{background:#f6f6f6;padding:10px;overflow:auto;border-radius:6px}.md code{background:#f6f6f6;padding:1px 4px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.md pre code{padding:0;background:transparent}.md ul,.md ol{padding-left:1.4em}img{max-width:100%;height:auto;border-radius:6px}.source-link{font-size:.9rem;margin-top:.75rem}`;

    readerDocument.title = post.title || "Reddit Reader";
    const viewport = element("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    readerDocument.head.append(viewport, element("style", styles));

    const root = element("main");
    root.id = "thread";
    root.append(
      element("p", post.subreddit_name_prefixed || "", "subreddit"),
      element("h1", post.title || "Untitled Reddit post"),
      renderMetadata(post, "post"),
      renderBody(post.selftext_html, post.selftext, "post"),
    );
    if (post.url) root.append(renderPostUrl(post.url));
    root.append(element("hr"), element("h2", "Comments"));

    const maxComments = 800;
    let renderedCommentCount = 0;
    for (const node of commentNodes) {
      if (renderedCommentCount >= maxComments) break;
      renderComment(node, 0, root);
    }
    if (!renderedCommentCount) root.append(element("p", "No comments found."));
    if (renderedCommentCount >= maxComments) {
      const notice = element("p");
      notice.append(element("em", "Stopped after " + maxComments + " comments."));
      root.append(notice);
    }
    readerDocument.body.append(root);

    // Install the finished reader and remove the site's markup and styles.
    // Existing window/document listeners and timers are not unloaded by a DOM swap.
    window.stop();
    if ("adoptedStyleSheets" in document) document.adoptedStyleSheets = [];
    document.replaceChild(readerDocument.documentElement, document.documentElement);
  } catch (error) {
    alert("Reddit Reader failed: " + (error && error.message ? error.message : error));
  }
})();
