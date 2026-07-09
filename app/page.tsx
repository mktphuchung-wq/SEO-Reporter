import {
  BookingCTASection,
  HeroSection,
  ItinerarySection,
  JourneyScrollytellingSection,
  RevealGallerySection,
  StickyMobileCTA,
  WebXRIslandMapSection,
  WindRoad3DSection,
} from "@/components/LandingSections";

export default function HomePage() {
  return (
    <main className="landing-page">
      <HeroSection />
      <JourneyScrollytellingSection />
      <WindRoad3DSection />
      <RevealGallerySection />
      <WebXRIslandMapSection />
      <ItinerarySection />
      <BookingCTASection />
      <StickyMobileCTA />
    </main>
  );
}
