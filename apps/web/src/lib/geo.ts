/** Browser geolocation → place label only (coords never sent to our API). */
export async function placeLabelFromGeo(): Promise<string> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not available on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12_000,
      maximumAge: 60_000,
    });
  });
  const { latitude, longitude } = pos.coords;
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "14");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Could not look up that place name");
  const data = (await res.json()) as {
    address?: {
      suburb?: string;
      neighbourhood?: string;
      village?: string;
      town?: string;
      city?: string;
      municipality?: string;
      state?: string;
    };
    display_name?: string;
  };
  const a = data.address ?? {};
  const neighborhood =
    a.suburb || a.neighbourhood || a.village || a.town || a.municipality || "";
  const cityName = a.city || a.town || a.state || "";
  if (neighborhood && cityName && neighborhood !== cityName) {
    return `${cityName} — ${neighborhood}`;
  }
  if (cityName) return cityName;
  if (neighborhood) return neighborhood;
  if (data.display_name) return data.display_name.split(",").slice(0, 2).join(",").trim();
  throw new Error("Could not read a city name from that location");
}
