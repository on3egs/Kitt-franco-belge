import { useEffect } from "react";
import { useLocation } from "wouter";

// Page déplacée vers /admin (panneau unifié)
export default function AdminVideos() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/admin"); }, []);
  return null;
}
