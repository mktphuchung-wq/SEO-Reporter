"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { phuQuyGallery } from "@/data/phuQuyGallery";
import { phuQuyImages, type PhuQuyImage } from "@/data/phuQuyImages";

const WindRoadCanvas = dynamic(() => import("./WindRoadCanvas"), {
  ssr: false,
  loading: () => <div className="wind-canvas wind-canvas-fallback" aria-hidden="true" />,
});

function useSectionProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const raw = (viewport - rect.top) / (rect.height + viewport);
      setProgress(Math.min(1, Math.max(0, raw)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return { ref, progress };
}

export function HeroSection() {
  const hero = phuQuyImages.hero;
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const imageTransform = `translate3d(0, ${progress * 26}px, 0) scale(${1.08 - progress * 0.04})`;
  const titleTransform = `scale(${1 + progress * 0.04})`;

  return (
    <section ref={ref} id="hero" className="hero-section landing-section">
      <div className="hero-media" style={{ transform: imageTransform }}>
        <Image src={hero.src} alt={hero.alt} fill priority sizes="100vw" className="object-cover" />
      </div>
      <div className="hero-overlay hero-overlay-bottom" />
      <div className="hero-overlay hero-overlay-glow" />
      <div className="hero-overlay hero-overlay-sea" />
      <div className="hero-reveal" />
      <div className="section-container hero-content">
        <p className="landing-eyebrow">Phú Quý immersive landing</p>
        <h1 style={{ transform: titleTransform }}>{hero.title}</h1>
        <p className="hero-copy">{hero.caption} Masking, reveal animation và CTA theo ngữ cảnh dẫn người xem từ cảm hứng đến lịch trình.</p>
        <div className="hero-actions">
          <a className="button button-primary" href="#itinerary">Xem lịch trình 3N2Đ</a>
          <a className="button button-secondary" href="#island-map">Xem bản đồ 3D</a>
        </div>
      </div>
    </section>
  );
}

const journeySteps = [
  {
    image: phuQuyImages.journeyDeparture,
    title: "Rời Phan Thiết",
    caption: "Một chuyến đi bắt đầu bằng cảm giác biển mở ra trước mắt.",
    ctaLabel: "Xem cách đi Phú Quý",
    ctaHref: "#journey",
  },
  {
    image: phuQuyImages.journeyIsland,
    title: "Đường chân trời mở ra",
    caption: "Đảo hiện dần qua từng nhịp scroll, giống cảm giác tiến gần Phú Quý.",
    ctaLabel: "Khám phá điểm nổi bật",
    ctaHref: "#gallery",
  },
  {
    image: phuQuyImages.galleryGanhHang,
    title: "Chạm Phú Quý",
    caption: "Bãi Nhỏ, Gành Hang và làn nước xanh là khoảnh khắc landing page cần reveal mạnh nhất.",
    ctaLabel: "Xem điểm check-in",
    ctaHref: "#gallery",
  },
];

export function JourneyScrollytellingSection() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActive(Number(entry.currentTarget.getAttribute("data-step") || 0));
          }
        });
      },
      { threshold: 0.55, rootMargin: "-15% 0px -25%" },
    );

    stepRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="journey" className="journey-section landing-section">
      <div className="section-container journey-grid">
        <div className="journey-visual" aria-live="polite">
          {journeySteps.map((step, index) => (
            <div
              key={step.title}
              className={`journey-image-layer ${active === index ? "is-active" : ""} ${index === 2 ? "is-masked" : ""}`}
              style={{ clipPath: index === 2 && active === 2 ? "polygon(0 0, 100% 0, 100% 100%, 0 100%)" : undefined }}
            >
              <Image src={step.image.src} alt={step.image.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            </div>
          ))}
          <div className="journey-panel-overlay" />
          <div className="journey-active-label">
            <span>0{active + 1}</span>
            <strong>{journeySteps[active].title}</strong>
          </div>
        </div>
        <div className="journey-copy-stack">
          <p className="landing-eyebrow">Scrollytelling</p>
          <h2>Cuộn từng nhịp để cảm giác ra đảo hiện dần.</h2>
          {journeySteps.map((step, index) => (
            <div
              key={step.title}
              ref={(node) => {
                stepRefs.current[index] = node;
              }}
              data-step={index}
              className={`journey-step ${active === index ? "is-active" : ""}`}
            >
              <span>0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.caption}</p>
              <a href={step.ctaHref}>{step.ctaLabel}</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WindRoad3DSection() {
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const imageReveal = Math.max(0, (progress - 0.75) / 0.25);

  return (
    <section ref={ref} id="wind-road" className="wind-section landing-section">
      <div className="section-container">
        <div className="section-heading light-heading">
          <p className="landing-eyebrow">Wind road 3D</p>
          <h2>Fly-through qua đường gió trước khi chạm ảnh thật.</h2>
        </div>
        <div className="wind-stage">
          <WindRoadCanvas />
          <div
            className="wind-real-image"
            style={{ opacity: imageReveal, clipPath: `inset(${(1 - imageReveal) * 35}% ${(1 - imageReveal) * 12}% 0% 0% round 28px)` }}
          >
            <Image src={phuQuyImages.windRoad.src} alt={phuQuyImages.windRoad.alt} fill sizes="(min-width: 1024px) 80vw, 100vw" className="object-cover" />
            <div className="wind-real-copy">
              <p className="landing-eyebrow">{phuQuyImages.windRoad.title}</p>
              <h3>Từ 3D đến khung hình thật</h3>
              <p>Sau cú fly-through qua đường gió, ảnh thật xuất hiện như điểm chạm cuối của hành trình.</p>
              <a className="button button-primary" href="#itinerary">Xem lịch trình road trip</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GalleryImageCard({ item, index }: { item: (typeof phuQuyGallery)[number]; index: number }) {
  return (
    <article className="gallery-card group" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="gallery-image-wrap">
        <Image src={item.src} alt={item.alt} fill sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
        <div className="gallery-gradient" />
      </div>
      <div className="gallery-card-content">
        <span>{item.tag}</span>
        <h3>{item.title}</h3>
        <p>{item.caption}</p>
        <a href={item.ctaHref}>{item.ctaLabel}</a>
      </div>
    </article>
  );
}

export function RevealGallerySection() {
  return (
    <section id="gallery" className="gallery-section landing-section">
      <div className="section-container">
        <div className="section-heading">
          <p className="landing-eyebrow">Reveal gallery</p>
          <h2>Ảnh thật thay thế visual placeholder để mỗi card có lý do bấm tiếp.</h2>
        </div>
        <div className="gallery-grid">
          {phuQuyGallery.map((item, index) => <GalleryImageCard key={item.title} item={item} index={index} />)}
        </div>
      </div>
    </section>
  );
}

const mapMarkers = [
  { image: phuQuyImages.galleryGanhHang, x: 58, y: 34, copy: "Gành Hang hợp reveal mạnh với biển xanh và đá.", ctaLabel: "Xem trên lịch trình", ctaHref: "#itinerary" },
  { image: phuQuyImages.galleryInfinityPool, x: 38, y: 50, copy: "Hồ vô cực dành cho hiệu ứng mask sóng.", ctaLabel: "Xem trên lịch trình", ctaHref: "#itinerary" },
  { image: phuQuyImages.galleryHonTranh, x: 70, y: 62, copy: "Hòn Tranh là điểm trải nghiệm biển và ảnh nhóm.", ctaLabel: "Xem trên lịch trình", ctaHref: "#itinerary" },
  { image: phuQuyImages.galleryMuiDoiThay, x: 30, y: 34, copy: "Mũi Đôi Thầy tăng cảm giác khám phá vách đá.", ctaLabel: "Lưu điểm này", ctaHref: "#booking" },
  { image: phuQuyImages.galleryLonelyTree, x: 48, y: 70, copy: "Cây cô đơn là điểm lưu cảm xúc cuối hành trình.", ctaLabel: "Lưu điểm này", ctaHref: "#booking" },
];

export function WebXRIslandMapSection() {
  const [active, setActive] = useState(0);
  const marker = mapMarkers[active];

  return (
    <section id="island-map" className="map-section landing-section">
      <div className="section-container map-grid">
        <div className="section-heading light-heading">
          <p className="landing-eyebrow">WebXR island map</p>
          <h2>Bản đồ đảo vẫn procedural, còn marker dùng preview ảnh CDN.</h2>
        </div>
        <div className="map-stage" aria-label="Bản đồ 3D mô phỏng đảo Phú Quý với điểm check-in">
          <div className="procedural-island" />
          {mapMarkers.map((item, index) => (
            <button
              key={item.image.title}
              type="button"
              className={`map-marker ${active === index ? "is-active" : ""}`}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
              onClick={() => setActive(index)}
              aria-label={`Xem ${item.image.title}`}
            />
          ))}
          <div className="map-preview-card">
            <div className="map-thumb">
              <Image src={marker.image.src} alt={marker.image.alt} fill sizes="(min-width: 768px) 220px, 45vw" className="object-cover" />
            </div>
            <div>
              <h3>{marker.image.title}</h3>
              <p>{marker.copy}</p>
              <a href={marker.ctaHref}>{marker.ctaLabel}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const itineraryDays: Array<{ day: string; title: string; caption: string; image: PhuQuyImage; cta: string; food?: PhuQuyImage }> = [
  { day: "Ngày 1", title: "Ra đảo và bắt nhịp biển", caption: "Khởi hành, nhận phòng và để khung cảnh Phú Quý mở đầu lịch trình.", image: phuQuyImages.journeyIsland, cta: "Tư vấn ngày khởi hành" },
  { day: "Ngày 2", title: "Check-in Bãi Nhỏ, Gành Hang", caption: "Ngày chính cho các điểm reveal mạnh: đá, nước xanh và ảnh nhóm.", image: phuQuyImages.galleryGanhHang, food: phuQuyImages.foodExperience, cta: "Chọn lịch check-in đẹp" },
  { day: "Ngày 3", title: "Cây cô đơn và cung khám phá", caption: "Chốt chuyến bằng những khung hình cảm xúc trước khi về đất liền.", image: phuQuyImages.galleryLonelyTree, cta: "Giữ lịch trình 3N2Đ" },
];

export function ItinerarySection() {
  return (
    <section id="itinerary" className="itinerary-section landing-section">
      <div className="section-container">
        <div className="section-heading">
          <p className="landing-eyebrow">Itinerary 3N2Đ</p>
          <h2>Lịch trình có ảnh ngữ cảnh để CTA không còn chung chung.</h2>
        </div>
        <div className="timeline">
          {itineraryDays.map((day) => (
            <article key={day.day} className="timeline-card">
              <div className="timeline-media">
                <Image src={day.image.src} alt={day.image.alt} fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" />
              </div>
              <div className="timeline-content">
                <span>{day.day}</span>
                <h3>{day.title}</h3>
                <p>{day.caption}</p>
                {day.food && (
                  <div className="food-chip">
                    <div className="food-thumb"><Image src={day.food.src} alt={day.food.alt} fill sizes="120px" className="object-cover" /></div>
                    <div><strong>{day.food.title}</strong><a href="#booking">Nhận gợi ý quán ăn</a></div>
                  </div>
                )}
                <a className="text-cta" href="#booking">{day.cta}</a>
              </div>
            </article>
          ))}
        </div>
        <div className="itinerary-final-cta">
          <a className="button button-primary" href="#booking">Nhận lịch trình phù hợp với nhóm của tôi</a>
        </div>
      </div>
    </section>
  );
}

export function BookingCTASection() {
  const trustItems = ["Tư vấn lịch tàu", "Gợi ý điểm check-in", "Lịch trình theo nhóm", "Ẩm thực địa phương"];
  return (
    <section id="booking" className="booking-section landing-section">
      <Image src={phuQuyImages.foodExperience.src} alt={phuQuyImages.foodExperience.alt} fill sizes="100vw" className="object-cover" />
      <div className="booking-overlay" />
      <div className="section-container booking-content">
        <p className="landing-eyebrow">Booking CTA</p>
        <h2>Sẵn sàng để Phú Quý trở thành chuyến đi đáng nhớ nhất mùa này?</h2>
        <p>Không cần thanh toán ngay. Tụi mình tư vấn lịch tàu, thời tiết và lịch trình trước khi bạn chốt.</p>
        <a className="button button-primary" href="mailto:hello@example.com?subject=Tu%20van%20Phu%20Quy">Giữ chỗ tư vấn miễn phí</a>
        <div className="trust-strip">
          {trustItems.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
    </section>
  );
}

export function StickyMobileCTA() {
  return (
    <a className="sticky-mobile-cta" href="#booking" aria-label="Nhắn Zalo nhận lịch trình Phú Quý">
      Nhắn Zalo nhận lịch trình
    </a>
  );
}
