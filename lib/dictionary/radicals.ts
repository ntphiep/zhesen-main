/**
 * The 214 Kangxi radicals with their Hán-Việt reading and a short Vietnamese meaning,
 * compiled from Vietnamese Wikipedia, Vietnamese Wiktionary and hvdic.thivien.net, the last
 * preferred where they disagreed. `char` is the canonical traditional glyph; `VARIANTS`
 * maps the simplified forms (氵 for 水, 辶 for 辵) back so either glyph resolves.
 */
export interface RadicalInfo {
  number: number
  char: string
  hanViet: string
  meaning: string
  strokes: number
}

const RADICALS: RadicalInfo[] = ([
  [1, '一', 'nhất', 'một', 1], [2, '丨', 'cổn', 'nét sổ dọc', 1], [3, '丶', 'chủ', 'điểm, chấm', 1],
  [4, '丿', 'phiệt', 'nét sổ xiên', 1], [5, '乙', 'ất', 'can thứ hai', 1], [6, '亅', 'quyết', 'nét sổ có móc', 1],
  [7, '二', 'nhị', 'hai', 2], [8, '亠', 'đầu', 'đầu, nắp đậy', 2], [9, '人', 'nhân', 'người', 2],
  [10, '儿', 'nhân', 'người (chân đi)', 2], [11, '入', 'nhập', 'vào', 2], [12, '八', 'bát', 'tám', 2],
  [13, '冂', 'quynh', 'vùng biên giới', 2], [14, '冖', 'mịch', 'trùm khăn lên', 2], [15, '冫', 'băng', 'nước đá', 2],
  [16, '几', 'kỷ', 'ghế dựa, bàn nhỏ', 2], [17, '凵', 'khảm', 'há miệng, hộp mở', 2], [18, '刀', 'đao', 'con dao', 2],
  [19, '力', 'lực', 'sức mạnh', 2], [20, '勹', 'bao', 'bao bọc', 2], [21, '匕', 'chủy', 'cái thìa', 2],
  [22, '匚', 'phương', 'hộp đựng', 2], [23, '匸', 'hễ', 'che đậy, giấu', 2], [24, '十', 'thập', 'mười', 2],
  [25, '卜', 'bốc', 'xem bói', 2], [26, '卩', 'tiết', 'con dấu, đốt tre', 2], [27, '厂', 'hán', 'sườn núi, vách đá', 2],
  [28, '厶', 'tư', 'riêng tư', 2], [29, '又', 'hựu', 'lại nữa', 2], [30, '口', 'khẩu', 'miệng', 3],
  [31, '囗', 'vi', 'vây quanh', 3], [32, '土', 'thổ', 'đất', 3], [33, '士', 'sĩ', 'học trò, kẻ sĩ', 3],
  [34, '夂', 'trĩ', 'đến sau, theo sau', 3], [35, '夊', 'tuy', 'đi chậm', 3], [36, '夕', 'tịch', 'buổi tối', 3],
  [37, '大', 'đại', 'to lớn', 3], [38, '女', 'nữ', 'đàn bà', 3], [39, '子', 'tử', 'con', 3],
  [40, '宀', 'miên', 'mái nhà', 3], [41, '寸', 'thốn', 'tấc (đơn vị)', 3], [42, '小', 'tiểu', 'nhỏ bé', 3],
  [43, '尢', 'uông', 'yếu, què chân', 3], [44, '尸', 'thi', 'xác chết', 3], [45, '屮', 'triệt', 'mầm cây', 3],
  [46, '山', 'sơn', 'núi', 3], [47, '巛', 'xuyên', 'sông', 3], [48, '工', 'công', 'công việc, thợ', 3],
  [49, '己', 'kỷ', 'bản thân mình', 3], [50, '巾', 'cân', 'cái khăn', 3], [51, '干', 'can', 'can, khô', 3],
  [52, '幺', 'yêu', 'nhỏ bé', 3], [53, '广', 'nghiễm', 'mái che, hiên', 3], [54, '廴', 'dẫn', 'bước dài', 3],
  [55, '廾', 'củng', 'chắp hai tay', 3], [56, '弋', 'dặc', 'bắn, cọc nhọn', 3], [57, '弓', 'cung', 'cái cung', 3],
  [58, '彐', 'kệ', 'đầu con nhím', 3], [59, '彡', 'sam', 'lông, tóc dài', 3], [60, '彳', 'sách', 'bước chân trái', 3],
  [61, '心', 'tâm', 'tim, lòng dạ', 4], [62, '戈', 'qua', 'cái mác, giáo', 4], [63, '戶', 'hộ', 'cửa một cánh', 4],
  [64, '手', 'thủ', 'tay', 4], [65, '支', 'chi', 'cành, nhánh', 4], [66, '攴', 'phộc', 'đánh khẽ', 4],
  [67, '文', 'văn', 'chữ, vẻ đẹp', 4], [68, '斗', 'đẩu', 'cái đấu (đong)', 4], [69, '斤', 'cân', 'cái rìu; cân', 4],
  [70, '方', 'phương', 'vuông, phương hướng', 4], [71, '无', 'vô', 'không có', 4], [72, '日', 'nhật', 'mặt trời, ngày', 4],
  [73, '曰', 'viết', 'nói rằng', 4], [74, '月', 'nguyệt', 'mặt trăng', 4], [75, '木', 'mộc', 'cây, gỗ', 4],
  [76, '欠', 'khiếm', 'thiếu, há miệng', 4], [77, '止', 'chỉ', 'dừng lại', 4], [78, '歹', 'đãi', 'xương tàn, xấu', 4],
  [79, '殳', 'thù', 'binh khí', 4], [80, '毋', 'vô', 'chớ, đừng', 4], [81, '比', 'tỷ', 'so sánh', 4],
  [82, '毛', 'mao', 'lông', 4], [83, '氏', 'thị', 'họ, dòng họ', 4], [84, '气', 'khí', 'hơi, khí', 4],
  [85, '水', 'thủy', 'nước', 4], [86, '火', 'hỏa', 'lửa', 4], [87, '爪', 'trảo', 'móng vuốt', 4],
  [88, '父', 'phụ', 'cha', 4], [89, '爻', 'hào', 'hào (Kinh Dịch)', 4], [90, '爿', 'tường', 'mảnh gỗ, giường', 4],
  [91, '片', 'phiến', 'mảnh, tấm', 4], [92, '牙', 'nha', 'răng', 4], [93, '牛', 'ngưu', 'trâu, bò', 4],
  [94, '犬', 'khuyển', 'chó', 4], [95, '玄', 'huyền', 'đen huyền, sâu xa', 5], [96, '玉', 'ngọc', 'ngọc', 5],
  [97, '瓜', 'qua', 'quả dưa', 5], [98, '瓦', 'ngõa', 'ngói, đồ gốm', 5], [99, '甘', 'cam', 'ngọt', 5],
  [100, '生', 'sinh', 'sống, sinh ra', 5], [101, '用', 'dụng', 'dùng', 5], [102, '田', 'điền', 'ruộng', 5],
  [103, '疋', 'sơ', 'tấm vải; chân', 5], [104, '疒', 'nạch', 'bệnh tật', 5], [105, '癶', 'bát', 'gạt ngược, chân dạng', 5],
  [106, '白', 'bạch', 'trắng', 5], [107, '皮', 'bì', 'da', 5], [108, '皿', 'mãnh', 'bát đĩa', 5],
  [109, '目', 'mục', 'mắt', 5], [110, '矛', 'mâu', 'cây giáo', 5], [111, '矢', 'thỉ', 'mũi tên', 5],
  [112, '石', 'thạch', 'đá', 5], [113, '示', 'thị', 'chỉ bảo, thần đất', 5], [114, '禸', 'nhựu', 'vết chân thú', 5],
  [115, '禾', 'hòa', 'lúa', 5], [116, '穴', 'huyệt', 'hang, lỗ', 5], [117, '立', 'lập', 'đứng', 5],
  [118, '竹', 'trúc', 'tre, trúc', 6], [119, '米', 'mễ', 'gạo', 6], [120, '糸', 'mịch', 'sợi tơ nhỏ', 6],
  [121, '缶', 'phẫu', 'đồ sành, vò', 6], [122, '网', 'võng', 'cái lưới', 6], [123, '羊', 'dương', 'con dê', 6],
  [124, '羽', 'vũ', 'lông vũ', 6], [125, '老', 'lão', 'già', 6], [126, '而', 'nhi', 'mà, và', 6],
  [127, '耒', 'lỗi', 'cái cày', 6], [128, '耳', 'nhĩ', 'tai', 6], [129, '聿', 'duật', 'cây bút', 6],
  [130, '肉', 'nhục', 'thịt', 6], [131, '臣', 'thần', 'bề tôi', 6], [132, '自', 'tự', 'tự mình; mũi', 6],
  [133, '至', 'chí', 'đến', 6], [134, '臼', 'cữu', 'cái cối', 6], [135, '舌', 'thiệt', 'lưỡi', 6],
  [136, '舛', 'suyễn', 'trái ngược nhau', 6], [137, '舟', 'chu', 'con thuyền', 6], [138, '艮', 'cấn', 'quẻ Cấn, dừng', 6],
  [139, '色', 'sắc', 'màu sắc', 6], [140, '艸', 'thảo', 'cỏ', 6], [141, '虍', 'hô', 'vằn hổ', 6],
  [142, '虫', 'trùng', 'sâu bọ', 6], [143, '血', 'huyết', 'máu', 6], [144, '行', 'hành', 'đi, làm', 6],
  [145, '衣', 'y', 'áo, quần áo', 6], [146, '襾', 'á', 'che đậy', 6], [147, '見', 'kiến', 'thấy, gặp', 7],
  [148, '角', 'giác', 'sừng, góc', 7], [149, '言', 'ngôn', 'lời nói', 7], [150, '谷', 'cốc', 'hang, khe núi', 7],
  [151, '豆', 'đậu', 'hạt đậu', 7], [152, '豕', 'thỉ', 'con lợn', 7], [153, '豸', 'trĩ', 'loài thú không chân', 7],
  [154, '貝', 'bối', 'vỏ sò, tiền của', 7], [155, '赤', 'xích', 'màu đỏ', 7], [156, '走', 'tẩu', 'chạy', 7],
  [157, '足', 'túc', 'chân, đủ', 7], [158, '身', 'thân', 'thân mình', 7], [159, '車', 'xa', 'xe', 7],
  [160, '辛', 'tân', 'cay, vất vả', 7], [161, '辰', 'thần', 'chi Thìn, buổi sớm', 7], [162, '辵', 'sước', 'chợt đi chợt dừng', 7],
  [163, '邑', 'ấp', 'vùng đất, làng', 7], [164, '酉', 'dậu', 'chi Dậu, rượu', 7], [165, '釆', 'biện', 'phân biệt', 7],
  [166, '里', 'lý', 'làng; dặm', 7], [167, '金', 'kim', 'vàng, kim loại', 8], [168, '長', 'trường', 'dài, lớn', 8],
  [169, '門', 'môn', 'cửa hai cánh', 8], [170, '阜', 'phụ', 'gò đất, đống', 8], [171, '隶', 'đãi', 'theo kịp, nô lệ', 8],
  [172, '隹', 'chuy', 'chim đuôi ngắn', 8], [173, '雨', 'vũ', 'mưa', 8], [174, '青', 'thanh', 'màu xanh', 8],
  [175, '非', 'phi', 'không phải, trái', 8], [176, '面', 'diện', 'mặt', 9], [177, '革', 'cách', 'da thuộc, thay đổi', 9],
  [178, '韋', 'vi', 'da thuộc mềm', 9], [179, '韭', 'cửu', 'rau hẹ', 9], [180, '音', 'âm', 'âm thanh', 9],
  [181, '頁', 'hiệt', 'đầu, trang giấy', 9], [182, '風', 'phong', 'gió', 9], [183, '飛', 'phi', 'bay', 9],
  [184, '食', 'thực', 'ăn, đồ ăn', 9], [185, '首', 'thủ', 'đầu', 9], [186, '香', 'hương', 'mùi thơm', 9],
  [187, '馬', 'mã', 'ngựa', 10], [188, '骨', 'cốt', 'xương', 10], [189, '高', 'cao', 'cao', 10],
  [190, '髟', 'tiêu', 'tóc dài', 10], [191, '鬥', 'đấu', 'đánh nhau', 10], [192, '鬯', 'sưởng', 'rượu nếp tế lễ', 10],
  [193, '鬲', 'cách', 'cái đỉnh, nồi', 10], [194, '鬼', 'quỷ', 'ma quỷ', 10], [195, '魚', 'ngư', 'cá', 11],
  [196, '鳥', 'điểu', 'chim', 11], [197, '鹵', 'lỗ', 'đất mặn, muối', 11], [198, '鹿', 'lộc', 'con hươu', 11],
  [199, '麥', 'mạch', 'lúa mạch', 11], [200, '麻', 'ma', 'cây gai, vừng', 11], [201, '黃', 'hoàng', 'màu vàng', 12],
  [202, '黍', 'thử', 'lúa nếp, kê', 12], [203, '黑', 'hắc', 'màu đen', 12], [204, '黹', 'chỉ', 'may, thêu', 12],
  [205, '黽', 'mãnh', 'con ếch', 13], [206, '鼎', 'đỉnh', 'cái vạc, đỉnh', 13], [207, '鼓', 'cổ', 'cái trống', 13],
  [208, '鼠', 'thử', 'con chuột', 13], [209, '鼻', 'tị', 'mũi', 14], [210, '齊', 'tề', 'ngang bằng, đều', 14],
  [211, '齒', 'xỉ', 'răng', 15], [212, '龍', 'long', 'con rồng', 16], [213, '龜', 'quy', 'con rùa', 16],
  [214, '龠', 'dược', 'sáo ba lỗ', 17],
] as [number, string, string, string, number][]).map(([number, char, hanViet, meaning, strokes]) => ({ number, char, hanViet, meaning, strokes }))

// Common simplified / combining variants -> the canonical radical glyph they belong to.
const VARIANTS: Record<string, string> = {
  '氵': '水', '氺': '水', '犭': '犬', '扌': '手', '忄': '心', '艹': '艸', '⺍': '小',
  '灬': '火', '刂': '刀', '辶': '辵', '讠': '言', '钅': '金', '纟': '糸', '糹': '糸',
  '罒': '网', '⺳': '网', '罓': '网', '贝': '貝', '车': '車', '马': '馬', '鱼': '魚',
  '鸟': '鳥', '龙': '龍', '门': '門', '饣': '食', '飠': '食', '见': '見', '页': '頁',
  '风': '風', '长': '長', '韦': '韋', '齐': '齊', '齿': '齒', '黾': '黽', '卤': '鹵',
  '麦': '麥', '黄': '黃', '⻊': '足', '⺶': '羊', '⺷': '羊',
}

const byGlyph = new Map<string, RadicalInfo>()
for (const r of RADICALS) byGlyph.set(r.char, r)
for (const [variant, canonical] of Object.entries(VARIANTS)) {
  const r = byGlyph.get(canonical)
  if (r) byGlyph.set(variant, r)
}

/** Look up a radical's Hán-Việt + meaning by its glyph (canonical or a known
 * simplified/combining variant). Returns null for an unknown glyph. */
export function radicalInfo(glyph: string | null | undefined): RadicalInfo | null {
  if (!glyph) return null
  return byGlyph.get(glyph.trim()) ?? null
}
