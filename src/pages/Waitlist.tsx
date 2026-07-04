import { useEffect, useState } from "react";
import WaitlistDesktop from "./WaitlistDesktop";
import WaitlistMobile from "./WaitlistMobile";

// Desktop and mobile are two fully separate designs (WaitlistDesktop.tsx /
// WaitlistMobile.tsx), not one responsive layout — this just decides which
// one mounts, so each can be iterated on independently without any risk of
// affecting the other.
const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

export default function Waitlist() {
  const isMobile = useIsMobile();
  return isMobile ? <WaitlistMobile /> : <WaitlistDesktop />;
}
