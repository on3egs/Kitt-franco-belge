import { useEffect, useRef } from "react";

export default function MidnightGuestbook() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const book = document.createElement("midnight-guestbook");
    host.current?.append(book);
    if (!document.querySelector("script[data-midnight-guestbook]")) {
      const script = document.createElement("script");
      script.src = `${import.meta.env.BASE_URL}kyronext-midnight/guestbook.js`;
      script.dataset.midnightGuestbook = "true";
      script.async = true;
      document.head.append(script);
    }
    return () => book.remove();
  }, []);
  return <div ref={host} id="midnight-guestbook" />;
}
