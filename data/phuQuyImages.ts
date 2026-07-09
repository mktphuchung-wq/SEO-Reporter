export type PhuQuyImage = {
  src: string;
  alt: string;
  title: string;
  caption: string;
  ctaLabel?: string;
  ctaHref?: string;
  section: "hero" | "journey" | "windRoad" | "gallery" | "map" | "itinerary" | "food" | "booking";
};

const CDN_HOST = "https://pub-5f4d009f85fb4ef88522b805d8312f4e.r2.dev";

export const phuQuyImages = {
  hero: {
    src: `${CDN_HOST}/du-lich-dao-phu-quy-ivivu.jpg`,
    alt: "Toàn cảnh biển đảo Phú Quý xanh trong cho hero landing page",
    title: "Phú Quý không chỉ để ngắm, mà để chạm vào.",
    caption: "Mở đầu hành trình bằng khung cảnh biển đảo rộng, xanh và giàu cảm xúc.",
    ctaLabel: "Xem lịch trình 3N2Đ",
    ctaHref: "#itinerary",
    section: "hero",
  },
  journeyDeparture: {
    src: `${CDN_HOST}/kinh-nghiem-du-lich-dao-phu-quy-danh-cho-du-khach-di-tu-tuc.jpeg`,
    alt: "Du lịch tự túc đảo Phú Quý với khung cảnh biển và hành trình ra đảo",
    title: "Rời đất liền để chạm đảo",
    caption: "Dùng cho bước scrollytelling từ Phan Thiết ra Phú Quý.",
    ctaLabel: "Xem cách đi Phú Quý",
    ctaHref: "#journey",
    section: "journey",
  },
  journeyIsland: {
    src: `${CDN_HOST}/du-lich-dao-phu-quy-4-ngay-3-dem-chi-4-trieu-nguoi-tu-ha-noi.jpg`,
    alt: "Khung cảnh du lịch đảo Phú Quý cho hành trình nhiều ngày",
    title: "Chạm Phú Quý",
    caption: "Dùng cho step đảo hiện dần trong scrollytelling.",
    ctaLabel: "Xem trải nghiệm nổi bật",
    ctaHref: "#gallery",
    section: "journey",
  },
  windRoad: {
    src: `${CDN_HOST}/tour-du-lich-dao-phu-quy_1758718193.jpg`,
    alt: "Tour du lịch đảo Phú Quý với cảnh đường ven đảo và trải nghiệm check-in",
    title: "Road trip giữa gió biển",
    caption: "Dùng làm ảnh chuyển cảnh sau section 3D điện gió.",
    ctaLabel: "Xem lịch trình road trip",
    ctaHref: "#itinerary",
    section: "windRoad",
  },
  galleryGanhHang: {
    src: `${CDN_HOST}/check-in-bai-nho-ganh-hang.jpg`,
    alt: "Check-in Bãi Nhỏ Gành Hang trên đảo Phú Quý",
    title: "Bãi Nhỏ - Gành Hang",
    caption: "Khung hình check-in mạnh nhất cho nhóm thích biển xanh, đá và cảm giác phiêu lưu.",
    ctaLabel: "Thêm vào lịch ngày 2",
    ctaHref: "#itinerary",
    section: "gallery",
  },
  galleryInfinityPool: {
    src: `${CDN_HOST}/ho-vo-cuc-dao-phu-quy-1536x1152.jpg`,
    alt: "Hồ vô cực đảo Phú Quý với nước xanh và vách đá",
    title: "Hồ vô cực",
    caption: "Dùng cho reveal animation dạng mask sóng, tạo cảm giác mở ra mặt nước.",
    ctaLabel: "Xem điểm check-in",
    ctaHref: "#gallery",
    section: "gallery",
  },
  galleryHonTranh: {
    src: `${CDN_HOST}/hon-tranh-phu-quy.jpg`,
    alt: "Hòn Tranh Phú Quý với biển xanh và cảnh đảo nhỏ",
    title: "Hòn Tranh",
    caption: "Một điểm hợp cho trải nghiệm biển, lặn ngắm san hô và ảnh nhóm.",
    ctaLabel: "Xem trải nghiệm biển",
    ctaHref: "#itinerary",
    section: "gallery",
  },
  galleryMuiDoiThay: {
    src: `${CDN_HOST}/mui-doi-thay-phu-quy.jpg`,
    alt: "Mũi Đôi Thầy Phú Quý với cảnh biển và đá",
    title: "Mũi Đôi Thầy",
    caption: "Dùng làm card địa hình/vách đá để tăng cảm giác khám phá.",
    ctaLabel: "Xem cung khám phá",
    ctaHref: "#journey",
    section: "gallery",
  },
  galleryLonelyTree: {
    src: `${CDN_HOST}/cay-co-don-dao-phu-quy_1760713943.webp`,
    alt: "Cây cô đơn đảo Phú Quý, điểm check-in được nhiều du khách yêu thích",
    title: "Cây cô đơn",
    caption: "Một khung hình cảm xúc, phù hợp section gallery và social proof.",
    ctaLabel: "Lưu điểm check-in",
    ctaHref: "#booking",
    section: "gallery",
  },
  foodSpecialties: {
    src: `${CDN_HOST}/dac-san-mon-an-ngon-dao-phu-quy.webp`,
    alt: "Đặc sản và món ăn ngon trên đảo Phú Quý",
    title: "Đặc sản đảo Phú Quý",
    caption: "Dùng trong itinerary ngày 2 hoặc section food highlight.",
    ctaLabel: "Nhận gợi ý quán ăn",
    ctaHref: "#booking",
    section: "food",
  },
  foodExperience: {
    src: `${CDN_HOST}/trai-nghiem-am-thuc-dao-phu-quy.jpg`,
    alt: "Trải nghiệm ẩm thực hải sản trên đảo Phú Quý",
    title: "Hải sản và bữa tối trên đảo",
    caption: "Dùng làm visual cho CTA cuối lịch trình.",
    ctaLabel: "Tư vấn lịch ăn chơi",
    ctaHref: "#booking",
    section: "booking",
  },
} satisfies Record<string, PhuQuyImage>;
