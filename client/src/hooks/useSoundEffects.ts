/*
 * useSoundEffects — Hook pour gérer les effets sonores futuristes KITT
 * Sons discrets et immersifs sans être envahissants
 */

import { useEffect, useRef } from "react";

// URLs CDN des SFX
const SFX_URLS = {
  scanner: "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_sfx_scanner_beep_1f0790ec.wav",
  boot: "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_sfx_boot_d1374749.wav",
  hover: "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_sfx_hover_6e47479f.wav",
  click: "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_sfx_click_3621201c.wav",
  glitch: "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_sfx_glitch_f8d376d1.wav",
  notification: "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_sfx_notification_1a5e666e.wav",
  ambient: "https://d2xsxph8kpxj0f.cloudfront.net/310519663464451480/29pRsRx59VejicpTpZcwq3/kitt_sfx_ambient_hum_1d14a67a.wav",
};

export function useSoundEffects() {
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const ambientRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Pré-charger tous les SFX
    Object.entries(SFX_URLS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 0.3; // Volume discret
      audioRefs.current[key] = audio;
    });

    return () => {};
  }, []);

  const play = (soundKey: keyof typeof SFX_URLS) => {
    const audio = audioRefs.current[soundKey];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Silencieusement ignorer les erreurs de lecture
      });
    }
  };

  return { play };
}
