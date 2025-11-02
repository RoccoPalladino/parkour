import { useEffect, useState } from "react";
import { Eip6963ProviderDetail, Eip6963AnnounceProviderEvent } from "./Eip6963Types";

export function useEip6963(): {
  providers: Eip6963ProviderDetail[];
  error: Error | undefined;
} {
  const [providers, setProviders] = useState<Eip6963ProviderDetail[]>([]);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAnnounceProvider = (event: Eip6963AnnounceProviderEvent) => {
      setProviders((prev) => {
        const exists = prev.some(
          (p) => p.info.uuid === event.detail.info.uuid
        );
        if (exists) {
          return prev;
        }
        return [...prev, event.detail];
      });
    };

    window.addEventListener(
      "eip6963:announceProvider",
      handleAnnounceProvider as unknown as EventListener
    );

    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener(
        "eip6963:announceProvider",
        handleAnnounceProvider as unknown as EventListener
      );
    };
  }, []);

  return { providers, error };
}

