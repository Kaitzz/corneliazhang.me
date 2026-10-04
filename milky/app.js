(() => {
  "use strict";

  const PROFILE_URL = "https://space.bilibili.com/3461574540921489";
  const FOLLOWER_API =
    "https://bilibili-follower-proxy.corneliazhang.workers.dev/?mid=3461574540921489";
  const LANGUAGE_KEY = "milky-landing-language";
  const FOLLOWER_KEY = "milky-landing-followers";
  const FALLBACK_COUNT = 38000;

  const copy = {
    en: {
      eyebrow: "Bilibili video intelligence",
      tagline: "Your beloved video assistant on Bilibili.",
      capabilities: "Video Summaries · Transcripts · Translation · Markdown Notes",
      ctaPrefix: "Visit MilkyAi on",
      ctaSuffix: "",
      ctaAria: "Visit MilkyAi on Bilibili",
      footer: "Made for curious minds and long videos.",
      followerLabel: "followers on Bilibili",
      followerAria: "Open the MilkyAi Bilibili profile",
      title: "MilkyAi — Your beloved video assistant",
      description:
        "MilkyAi turns Bilibili videos into summaries, transcripts, translations, and Markdown notes.",
    },
    zh: {
      eyebrow: "B站视频智能助手",
      tagline: "你喜爱的视频助手",
      capabilities: "视频总结 · 视频文稿提取 · 视频文稿翻译 · Markdown 笔记",
      ctaPrefix: "前往 MilkyAi 的",
      ctaSuffix: "主页",
      ctaAria: "前往 MilkyAi 的 B站主页",
      footer: "为好奇心，也为每一条值得认真看的长视频。",
      followerLabel: "位 B站粉丝",
      followerAria: "打开 MilkyAi 的 B站主页",
      title: "MilkyAi — 你喜爱的视频助手",
      description: "MilkyAi 将 B站视频整理为总结、文稿、翻译与 Markdown 笔记。",
    },
  };

  let followerCount = null;
  let languageTransitionInProgress = false;

  function readStoredLanguage() {
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY);
      if (stored === "en" || stored === "zh") return stored;
    } catch (_) {
      // Storage can be unavailable in strict privacy modes.
    }
    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function formatFollowerCount(count, language) {
    if (language === "zh") {
      if (count >= 10000) {
        return `${(count / 10000).toFixed(1).replace(/\.0$/, "")}万`;
      }
      return count.toLocaleString("zh-CN");
    }
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    }
    return count.toLocaleString("en-US");
  }

  function setLanguage(language, persist = true) {
    const selected = copy[language] ? language : "en";
    const strings = copy[selected];
    document.documentElement.lang = selected === "zh" ? "zh-CN" : "en";
    document.title = strings.title;

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;
      if (Object.prototype.hasOwnProperty.call(strings, key)) {
        element.textContent = strings[key];
      }
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      const key = element.dataset.i18nAria;
      if (strings[key]) element.setAttribute("aria-label", strings[key]);
    });
    document.querySelectorAll(".language-switch button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === selected));
    });

    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", strings.description);
    document.getElementById("follower-count").textContent = formatFollowerCount(
      followerCount ?? FALLBACK_COUNT,
      selected,
    ) + (followerCount === null ? "+" : "");
    document.getElementById("follower-label").textContent = strings.followerLabel;

    if (persist) {
      try {
        localStorage.setItem(LANGUAGE_KEY, selected);
      } catch (_) {
        // The language still applies for the current page.
      }
    }
  }

  function waitForOpacityTransition(element) {
    return new Promise((resolve) => {
      const finish = (event) => {
        if (event.target !== element || event.propertyName !== "opacity") return;
        element.removeEventListener("transitionend", finish);
        resolve();
      };
      element.addEventListener("transitionend", finish);
    });
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  async function transitionLanguage(language) {
    const selected = copy[language] ? language : "en";
    const current = document.documentElement.lang.startsWith("zh") ? "zh" : "en";
    if (selected === current || languageTransitionInProgress) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLanguage(selected);
      return;
    }

    languageTransitionInProgress = true;
    const transitionTarget = document.querySelector(".hero-copy");
    document.body.classList.add("language-transitioning");
    await waitForOpacityTransition(transitionTarget);

    setLanguage(selected);
    await nextFrame();
    await nextFrame();

    document.body.classList.remove("language-transitioning");
    await waitForOpacityTransition(transitionTarget);
    languageTransitionInProgress = false;
  }

  function readCachedFollowers() {
    try {
      const cached = JSON.parse(localStorage.getItem(FOLLOWER_KEY) || "null");
      if (cached && Number.isFinite(cached.count) && cached.count >= 0) {
        return cached.count;
      }
    } catch (_) {
      // Ignore stale or malformed cached data.
    }
    return null;
  }

  async function refreshFollowers() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(FOLLOWER_API, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Follower API returned ${response.status}`);
      const payload = await response.json();
      if (!Number.isFinite(payload.follower) || payload.follower < 0) {
        throw new Error("Follower API returned an invalid count");
      }
      followerCount = payload.follower;
      try {
        localStorage.setItem(
          FOLLOWER_KEY,
          JSON.stringify({ count: followerCount, updatedAt: Date.now() }),
        );
      } catch (_) {
        // A fresh count can still be shown without local storage.
      }
      setLanguage(document.documentElement.lang.startsWith("zh") ? "zh" : "en", false);
    } catch (error) {
      console.info("[MilkyAi] Live follower count unavailable; using cached fallback.", error);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function startPointerField() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;

    const updateTarget = (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
    };

    window.addEventListener("pointermove", updateTarget, { passive: true });

    const animate = () => {
      currentX += (targetX - currentX) * 0.075;
      currentY += (targetY - currentY) * 0.075;
      document.documentElement.style.setProperty(
        "--pointer-x",
        `${(currentX / window.innerWidth) * 100}%`,
      );
      document.documentElement.style.setProperty(
        "--pointer-y",
        `${(currentY / window.innerHeight) * 100}%`,
      );
      window.requestAnimationFrame(animate);
    };
    animate();
  }

  document.querySelectorAll(".language-switch button").forEach((button) => {
    button.addEventListener("click", () => transitionLanguage(button.dataset.lang));
  });

  document.querySelectorAll('a[href^="https://space.bilibili.com/"]').forEach((link) => {
    link.href = PROFILE_URL;
  });

  followerCount = readCachedFollowers();
  setLanguage(readStoredLanguage(), false);
  startPointerField();
  refreshFollowers();
})();
