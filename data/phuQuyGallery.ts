import { phuQuyImages, type PhuQuyImage } from "./phuQuyImages";

export type PhuQuyGalleryItem = Pick<
  PhuQuyImage,
  "src" | "alt" | "title" | "caption" | "ctaLabel" | "ctaHref"
> & {
  tag: string;
};

export const phuQuyGallery: PhuQuyGalleryItem[] = [
  {
    ...phuQuyImages.galleryGanhHang,
    tag: "Check-in",
    caption: "Biển xanh, đá và góc chụp rất điện ảnh cho nhóm thích khám phá.",
  },
  {
    ...phuQuyImages.galleryInfinityPool,
    tag: "Must-see",
    caption: "Mảng nước xanh sát đá, rất hợp hiệu ứng masking reveal dạng sóng.",
  },
  {
    ...phuQuyImages.galleryHonTranh,
    tag: "Biển đảo",
    caption: "Một điểm hợp cho trải nghiệm biển, lặn ngắm san hô và ảnh nhóm.",
  },
  {
    ...phuQuyImages.galleryLonelyTree,
    tag: "Photo spot",
    caption: "Khung hình đơn giản nhưng giàu cảm xúc, hợp để kéo người dùng vào CTA cuối.",
  },
  {
    ...phuQuyImages.galleryMuiDoiThay,
    tag: "Khám phá",
    caption: "Vách đá và đường bờ biển tạo cảm giác phiêu lưu cho cung khám phá.",
  },
  {
    ...phuQuyImages.foodSpecialties,
    tag: "Ẩm thực",
    caption: "Đặc sản địa phương giúp lịch trình không chỉ đẹp ảnh mà còn đáng nhớ.",
  },
];
