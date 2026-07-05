async function searchResults(keyword) {
    const results = [];
    try {
        const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        let response = await fetch("https://batcave.biz/search/" + encodeURIComponent(keyword), {
            headers: { "User-Agent": ua }
        });
        let html = await response.text();
        console.log("[BatCave] searchA status:" + response.status + " len:" + html.length + " hasTile:" + html.includes("readed__img"));

        if (!html.includes("readed__img")) {
            const body = "do=search&subaction=search&search_start=1&full_search=0&result_from=1&story=" + encodeURIComponent(keyword);
            response = await fetch("https://batcave.biz/", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": ua },
                body: body
            });
            html = await response.text();
            console.log("[BatCave] searchB status:" + response.status + " len:" + html.length + " hasTile:" + html.includes("readed__img"));
        }

        const regex = /<a href="([^"]+)"[^>]*class="readed__img[^>]*>\s*<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]+)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                id: toAbsolute(match[1]),
                imageURL: toAbsolute(match[2]),
                title: decodeEntities(match[3].trim())
            });
        }
        console.log("[BatCave] search parsed:" + results.length);
        return results;
    } catch (err) {
        console.log("[BatCave] search error:" + err);
        return [];
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        const html = await response.text();

        let description = "";
        const descMatch = html.match(/<div class="page__text[^"]*full-text[^"]*">([\s\S]*?)<\/div>/);
        if (descMatch) {
            description = decodeEntities(stripTags(descMatch[1]));
        }

        const tags = [];
        const tagsBlock = html.match(/<div class="page__tags[^"]*">([\s\S]*?)<\/div>/);
        if (tagsBlock) {
            const tre = /<a[^>]*>([^<]+)<\/a>/g;
            let tm;
            while ((tm = tre.exec(tagsBlock[1])) !== null) {
                tags.push(decodeEntities(tm[1].trim()));
            }
        }
        const listBlock = html.match(/<ul class="page__list">([\s\S]*?)<\/ul>/);
        if (listBlock) {
            const lre = /<li><div>[^<]*<\/div>\s*(?:<a[^>]*>([^<]+)<\/a>|([^<]+))<\/li>/g;
            let lm;
            while ((lm = lre.exec(listBlock[1])) !== null) {
                const val = decodeEntities((lm[1] || lm[2] || "").trim());
                if (val) tags.push(val);
            }
        }

        return { description: description, tags: tags };
    } catch (err) {
        return { description: "", tags: [] };
    }
}

async function extractChapters(url) {
    const results = [];
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        const html = await response.text();

        const dataMatch = html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/);
        if (dataMatch) {
            const data = JSON.parse(dataMatch[1]);
            const newsId = data.news_id;
            if (data.chapters && data.chapters.length) {
                for (const ch of data.chapters) {
                    results.push([
                        String(ch.posi),
                        [{
                            id: `https://batcave.biz/reader/${newsId}/${ch.id}`,
                            title: decodeEntities(ch.title || `#${ch.posi}`),
                            chapter: ch.posi,
                            scanlation_group: ""
                        }]
                    ]);
                }
            }
        }

        results.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
        return { en: results };
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(url) {
    try {
        const parts = url.replace(/\/+$/, "").split("/");
        const chapterId = parts.pop();
        const newsId = parts.pop();
        const response = await fetch("https://batcave.biz/engine/ajax/controller.php?mod=api&action=reader%2FgetChapterData", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            body: JSON.stringify({ news_id: parseInt(newsId), chapter_id: parseInt(chapterId) })
        });
        const text = await response.text();
        const json = JSON.parse(text);
        const images = (json && json.data && json.data.images) ? json.data.images : [];
        return images.map(toAbsolute);
    } catch (err) {
        return [];
    }
}

function toAbsolute(url) {
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return "https://batcave.biz" + url;
    if (url.startsWith("http://")) return url.replace("http://", "https://");
    if (url.startsWith("https://")) return url;
    return "https://batcave.biz/" + url;
}

function decodeEntities(str) {
    if (!str) return "";
    return str
        .replace(/&#0?39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&mdash;/g, "\u2014");
}

function stripTags(html) {
    return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
