/** Rows read from production on 2026-09-28, unedited, so the parsers and the pages are
 *  tested against what PostgREST really sends. */

/** en:warranty read with `LEARNER_SELECT` (lib/dictionary/learner.ts). */
export const WARRANTY_LAYER_ROW = {
  "entry_id": "en:warranty",
  "gist_vi": [
    "bảo hành",
    "sự bảo đảm"
  ],
  "level": "B1",
  "usage_note_vi": "Warranty thường gặp nhất trong ngữ cảnh mua bán sản phẩm (bảo hành). Cụm \"under warranty\" nghĩa là sản phẩm vẫn còn trong thời hạn bảo hành. Người học hay nhầm warranty với guarantee: cả hai đều nghĩa là bảo đảm, nhưng warranty thường dùng cho sản phẩm và mang tính pháp lý cụ thể hơn, còn guarantee dùng rộng hơn trong đời thường.",
  "status": "published",
  "learner_senses": [
    {
      "pos": "noun",
      "cefr": "B1",
      "domain": "commerce",
      "register": null,
      "vi_terms": [
        "bảo hành",
        "giấy bảo hành"
      ],
      "sense_order": 1,
      "en_definition": "A written promise to repair or replace a product free of charge if it breaks within a set period.",
      "vi_definition": "Cam kết bằng văn bản từ nhà sản xuất hoặc người bán, đảm bảo sửa chữa hoặc thay thế miễn phí nếu sản phẩm bị lỗi trong một thời hạn nhất định.",
      "learner_examples": [
        {
          "vi": "Tôi mua thêm gói bảo hành mở rộng cho tivi trong năm năm với giá 100 đô la.",
          "text": "I took out an extended warranty on my television for five years at a cost of $100.",
          "reading": null,
          "example_order": 1,
          "source_example_id": 695065
        },
        {
          "vi": "Sản phẩm này có đi kèm bảo hành không?",
          "text": "Does it come with a warranty?",
          "reading": null,
          "example_order": 2,
          "source_example_id": 830277
        }
      ],
      "source_sense_ids": [
        "en:warranty#5"
      ]
    },
    {
      "pos": "noun",
      "cefr": "B2",
      "domain": null,
      "register": "formal",
      "vi_terms": [
        "sự bảo đảm",
        "sự cam đoan"
      ],
      "sense_order": 2,
      "en_definition": "A guarantee that a certain outcome or obligation will be fulfilled.",
      "vi_definition": "Lời cam kết hoặc sự bảo đảm rằng một kết quả hoặc nghĩa vụ nhất định sẽ được thực hiện.",
      "learner_examples": [
        {
          "vi": "Tuy nhiên, quản trị không phải là liều thuốc vạn năng cho mọi vấn đề kinh doanh; đó là lời cảnh báo, không phải sự bảo đảm chống lại thất bại.",
          "text": "However, governance is no universal panacea for business ills; it is a warning, not a warranty against failure.",
          "reading": null,
          "example_order": 1,
          "source_example_id": 334600
        }
      ],
      "source_sense_ids": [
        "en:warranty#1"
      ]
    },
    {
      "pos": "noun",
      "cefr": "C1",
      "domain": "law",
      "register": "formal",
      "vi_terms": [
        "bảo đảm",
        "điều khoản bảo đảm"
      ],
      "sense_order": 3,
      "en_definition": "A legal agreement stating that goods or property will be as promised at the time of sale.",
      "vi_definition": "Thỏa thuận pháp lý (bằng văn bản hoặc ngầm định) cam kết rằng hàng hóa hoặc tài sản đúng như đã mô tả khi mua bán.",
      "learner_examples": [
        {
          "vi": "Người bán đưa ra điều khoản bảo đảm minh thị rằng ngôi nhà không có lỗi kết cấu.",
          "text": "The seller provided an expressed warranty that the house was free of structural defects.",
          "reading": null,
          "example_order": 1,
          "source_example_id": null
        }
      ],
      "source_sense_ids": [
        "en:warranty#4"
      ]
    }
  ],
  "learner_links": [
    {
      "vi": "thời hạn bảo hành",
      "kind": "collocation",
      "lang": "en",
      "text": "warranty period",
      "example": "What is the warranty period?",
      "note_vi": null,
      "pattern": "N + N",
      "reading": null,
      "example_vi": "Thời hạn bảo hành là bao lâu?",
      "link_order": 1,
      "sense_order": 1,
      "target_entry_id": "en:warranty period"
    },
    {
      "vi": "còn trong thời hạn bảo hành",
      "kind": "collocation",
      "lang": "en",
      "text": "under warranty",
      "example": "The phone is still under warranty.",
      "note_vi": null,
      "pattern": "prep + N",
      "reading": null,
      "example_vi": "Chiếc điện thoại vẫn còn trong thời hạn bảo hành.",
      "link_order": 2,
      "sense_order": 1,
      "target_entry_id": "en:under warranty"
    },
    {
      "vi": "bảo hành mở rộng",
      "kind": "collocation",
      "lang": "en",
      "text": "extended warranty",
      "example": "Would you like to purchase an extended warranty?",
      "note_vi": null,
      "pattern": "adj + N",
      "reading": null,
      "example_vi": "Bạn có muốn mua gói bảo hành mở rộng không?",
      "link_order": 3,
      "sense_order": 1,
      "target_entry_id": "en:extended warranty"
    },
    {
      "vi": "bảo hành hết hạn",
      "kind": "collocation",
      "lang": "en",
      "text": "warranty expires",
      "example": "The warranty expires next month.",
      "note_vi": null,
      "pattern": "N + V",
      "reading": null,
      "example_vi": "Bảo hành sẽ hết hạn vào tháng tới.",
      "link_order": 4,
      "sense_order": 1,
      "target_entry_id": "en:warranty expires"
    },
    {
      "vi": "làm mất hiệu lực bảo hành",
      "kind": "collocation",
      "lang": "en",
      "text": "void the warranty",
      "example": "Opening the device will void the warranty.",
      "note_vi": null,
      "pattern": "V + N",
      "reading": null,
      "example_vi": "Mở thiết bị ra sẽ làm mất hiệu lực bảo hành.",
      "link_order": 5,
      "sense_order": 1,
      "target_entry_id": "en:void the warranty"
    },
    {
      "vi": null,
      "kind": "synonym",
      "lang": "en",
      "text": "guarantee",
      "example": null,
      "note_vi": "Nghĩa gần giống, dùng thay thế được trong hầu hết ngữ cảnh về sản phẩm.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 6,
      "sense_order": 1,
      "target_entry_id": "en:guarantee"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "es",
      "text": "garantía",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 7,
      "sense_order": 1,
      "target_entry_id": "es:garantía"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "zh",
      "text": "保修",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 8,
      "sense_order": 1,
      "target_entry_id": null
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "zh",
      "text": "质保",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 9,
      "sense_order": 1,
      "target_entry_id": null
    },
    {
      "vi": "không có sự bảo đảm",
      "kind": "collocation",
      "lang": "en",
      "text": "no warranty",
      "example": "The software is provided with no warranty.",
      "note_vi": null,
      "pattern": "det + N",
      "reading": null,
      "example_vi": "Phần mềm được cung cấp mà không có sự bảo đảm nào.",
      "link_order": 1,
      "sense_order": 2,
      "target_entry_id": "en:no warranty"
    },
    {
      "vi": null,
      "kind": "synonym",
      "lang": "en",
      "text": "assurance",
      "example": null,
      "note_vi": "Nhấn mạnh sự trấn an, ít mang tính ràng buộc pháp lý hơn warranty.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 2,
      "sense_order": 2,
      "target_entry_id": "en:assurance"
    },
    {
      "vi": null,
      "kind": "synonym",
      "lang": "en",
      "text": "guarantee",
      "example": null,
      "note_vi": "Tương đương, dùng phổ biến hơn trong đời thường.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 3,
      "sense_order": 2,
      "target_entry_id": "en:guarantee"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "es",
      "text": "garantía",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 4,
      "sense_order": 2,
      "target_entry_id": "es:garantía"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "zh",
      "text": "保证",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 5,
      "sense_order": 2,
      "target_entry_id": "zh:保证"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "zh",
      "text": "担保",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 6,
      "sense_order": 2,
      "target_entry_id": null
    },
    {
      "vi": "bảo đảm ngầm định",
      "kind": "collocation",
      "lang": "en",
      "text": "implied warranty",
      "example": "The product comes with an implied warranty of merchantability.",
      "note_vi": null,
      "pattern": "adj + N",
      "reading": null,
      "example_vi": "Sản phẩm đi kèm bảo đảm ngầm định về khả năng thương mại.",
      "link_order": 1,
      "sense_order": 3,
      "target_entry_id": "en:implied warranty"
    },
    {
      "vi": "bảo đảm minh thị",
      "kind": "collocation",
      "lang": "en",
      "text": "expressed warranty",
      "example": "The contract includes an expressed warranty.",
      "note_vi": null,
      "pattern": "adj + N",
      "reading": null,
      "example_vi": "Hợp đồng bao gồm một điều khoản bảo đảm minh thị.",
      "link_order": 2,
      "sense_order": 3,
      "target_entry_id": "en:expressed warranty"
    },
    {
      "vi": "vi phạm điều khoản bảo đảm",
      "kind": "collocation",
      "lang": "en",
      "text": "breach of warranty",
      "example": "The buyer sued for breach of warranty.",
      "note_vi": null,
      "pattern": "N + prep + N",
      "reading": null,
      "example_vi": "Người mua kiện vì vi phạm điều khoản bảo đảm.",
      "link_order": 3,
      "sense_order": 3,
      "target_entry_id": "en:breach of warranty"
    },
    {
      "vi": null,
      "kind": "synonym",
      "lang": "en",
      "text": "guarantee",
      "example": null,
      "note_vi": "Dùng rộng hơn, warranty mang tính pháp lý hơn.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 4,
      "sense_order": 3,
      "target_entry_id": "en:guarantee"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "es",
      "text": "garantía legal",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 5,
      "sense_order": 3,
      "target_entry_id": null
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "zh",
      "text": "担保",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 6,
      "sense_order": 3,
      "target_entry_id": null
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "zh",
      "text": "保证条款",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 7,
      "sense_order": 3,
      "target_entry_id": null
    },
    {
      "vi": null,
      "kind": "confusable",
      "lang": "en",
      "text": "guarantee",
      "example": null,
      "note_vi": "Guarantee rộng nghĩa hơn, dùng trong mọi ngữ cảnh. Warranty thường chỉ dùng cho sản phẩm hoặc trong pháp lý.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 1,
      "sense_order": null,
      "target_entry_id": "en:guarantee"
    },
    {
      "vi": null,
      "kind": "confusable",
      "lang": "en",
      "text": "warrant",
      "example": null,
      "note_vi": "Warrant là danh từ (lệnh, trát) hoặc động từ (biện minh, bảo đảm), không phải bảo hành sản phẩm. Đừng nhầm với warranty.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 2,
      "sense_order": null,
      "target_entry_id": "en:warrant"
    }
  ],
  "sense_labels": [
    {
      "lemma": null,
      "domain": "commerce",
      "register": null,
      "sense_id": "en:warranty#5",
      "vi_terms": [
        "bảo hành",
        "giấy bảo hành"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": 1
    },
    {
      "lemma": null,
      "domain": null,
      "register": "formal",
      "sense_id": "en:warranty#1",
      "vi_terms": [
        "sự bảo đảm",
        "sự cam đoan"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": 2
    },
    {
      "lemma": null,
      "domain": "law",
      "register": "formal",
      "sense_id": "en:warranty#4",
      "vi_terms": [
        "bảo đảm",
        "điều khoản bảo đảm"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": 3
    },
    {
      "lemma": null,
      "domain": "law",
      "register": "archaic",
      "sense_id": "en:warranty#2",
      "vi_terms": [
        "giao ước bảo đảm quyền sở hữu đất"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": null
    },
    {
      "lemma": null,
      "domain": "law",
      "register": "formal",
      "sense_id": "en:warranty#3",
      "vi_terms": [
        "giao ước bảo đảm quyền sở hữu"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": null
    },
    {
      "lemma": null,
      "domain": "insurance",
      "register": "formal",
      "sense_id": "en:warranty#6",
      "vi_terms": [
        "điều khoản bảo đảm bảo hiểm"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": null
    },
    {
      "lemma": null,
      "domain": null,
      "register": "formal",
      "sense_id": "en:warranty#7",
      "vi_terms": [
        "sự biện minh",
        "căn cứ"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": null
    },
    {
      "lemma": null,
      "domain": null,
      "register": "rare",
      "sense_id": "en:warranty#8",
      "vi_terms": [
        "bảo đảm"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": null
    }
  ]
}

export const XUEXI_LAYER_ROW = {
  "entry_id": "zh:学习",
  "gist_vi": [
    "học",
    "học tập",
    "học hỏi"
  ],
  "level": "A1",
  "usage_note_vi": "学习 là từ rất phổ biến trong tiếng Trung, dùng cho cả việc học ở trường lẫn tự học bất kỳ kiến thức hay kỹ năng nào. Khác với 学 (đơn âm tiết, thường ghép với tân ngữ trực tiếp như 学中文), 学习 có thể dùng độc lập hoặc làm danh từ (如：学习计划 = kế hoạch học tập). Người Việt hay nhầm 学习 với 研究; 学习 là học nói chung, còn 研究 thiên về nghiên cứu chuyên sâu.",
  "status": "published",
  "learner_senses": [
    {
      "pos": "verb",
      "cefr": "A1",
      "domain": null,
      "register": null,
      "vi_terms": [
        "học",
        "học tập",
        "học hỏi"
      ],
      "sense_order": 1,
      "en_definition": "To learn or study something in order to gain knowledge or skills.",
      "vi_definition": "Tiếp thu kiến thức hoặc kỹ năng thông qua việc đọc sách, nghe giảng, luyện tập hoặc trải nghiệm.",
      "learner_examples": [
        {
          "vi": "Cô ấy cũng học tiếng Trung.",
          "text": "她也学习汉语。",
          "reading": "tā yě xuéxí hànyǔ.",
          "example_order": 1,
          "source_example_id": 72447
        },
        {
          "vi": "Tom chăm chỉ học tập.",
          "text": "汤姆努力学习。",
          "reading": "tāngmǔ nǔlì xuéxí.",
          "example_order": 2,
          "source_example_id": 72446
        }
      ],
      "source_sense_ids": [
        "zh:学习:s1",
        "zh:学习:s2"
      ]
    }
  ],
  "learner_links": [
    {
      "vi": null,
      "kind": "synonym",
      "lang": "zh",
      "text": "学",
      "example": null,
      "note_vi": "Ngắn gọn hơn, dùng nhiều trong khẩu ngữ, thường ghép với từ khác như 学中文.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 6,
      "sense_order": 1,
      "target_entry_id": "zh:学"
    },
    {
      "vi": null,
      "kind": "synonym",
      "lang": "zh",
      "text": "研究",
      "example": null,
      "note_vi": "Thiên về nghiên cứu chuyên sâu, mang tính học thuật hơn 学习.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 7,
      "sense_order": 1,
      "target_entry_id": "zh:研究"
    },
    {
      "vi": null,
      "kind": "synonym",
      "lang": "zh",
      "text": "念书",
      "example": null,
      "note_vi": "Thiên về việc đi học ở trường, mang tính khẩu ngữ.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 8,
      "sense_order": 1,
      "target_entry_id": null
    },
    {
      "vi": null,
      "kind": "antonym",
      "lang": "zh",
      "text": "教",
      "example": null,
      "note_vi": "Nghĩa là dạy, ngược lại với học.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 9,
      "sense_order": 1,
      "target_entry_id": "zh:教"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "en",
      "text": "learn",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 10,
      "sense_order": 1,
      "target_entry_id": "en:learn"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "en",
      "text": "study",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 11,
      "sense_order": 1,
      "target_entry_id": "en:study"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "es",
      "text": "aprender",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 12,
      "sense_order": 1,
      "target_entry_id": "es:aprender"
    },
    {
      "vi": null,
      "kind": "equivalent",
      "lang": "es",
      "text": "estudiar",
      "example": null,
      "note_vi": null,
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 13,
      "sense_order": 1,
      "target_entry_id": "es:estudiar"
    },
    {
      "vi": null,
      "kind": "confusable",
      "lang": "zh",
      "text": "学",
      "example": null,
      "note_vi": "学 thường dùng trong khẩu ngữ và phải có tân ngữ (学英语), còn 学习 có thể đứng một mình (努力学习).",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 1,
      "sense_order": null,
      "target_entry_id": "zh:学"
    },
    {
      "vi": null,
      "kind": "confusable",
      "lang": "zh",
      "text": "研究",
      "example": null,
      "note_vi": "研究 là nghiên cứu chuyên sâu (research), không nên nhầm với 学习 là học tập nói chung.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 2,
      "sense_order": null,
      "target_entry_id": "zh:研究"
    },
    {
      "vi": null,
      "kind": "confusable",
      "lang": "zh",
      "text": "读书",
      "example": null,
      "note_vi": "读书 thiên về đọc sách hoặc đi học (ở trường), phạm vi hẹp hơn 学习.",
      "pattern": null,
      "reading": null,
      "example_vi": null,
      "link_order": 3,
      "sense_order": null,
      "target_entry_id": "zh:读书"
    },
    {
      "vi": "chăm chỉ học tập",
      "kind": "collocation",
      "lang": "zh",
      "text": "努力学习",
      "example": "他每天努力学习。",
      "note_vi": null,
      "pattern": "adv + V",
      "reading": "tā měitiān nǔlì xuéxí.",
      "example_vi": "Anh ấy mỗi ngày đều chăm chỉ học tập.",
      "link_order": 2,
      "sense_order": 1,
      "target_entry_id": "zh:努力学习"
    },
    {
      "vi": "học ngoại ngữ",
      "kind": "collocation",
      "lang": "zh",
      "text": "学习外语",
      "example": "她正在学习外语。",
      "note_vi": null,
      "pattern": "V + N",
      "reading": "tā zhèngzài xuéxí wàiyǔ.",
      "example_vi": "Cô ấy đang học ngoại ngữ.",
      "link_order": 3,
      "sense_order": 1,
      "target_entry_id": "zh:学习外语"
    },
    {
      "vi": "kết quả học tập",
      "kind": "collocation",
      "lang": "zh",
      "text": "学习成绩",
      "example": "他的学习成绩很好。",
      "note_vi": null,
      "pattern": "N + N (modifier)",
      "reading": "tā de xuéxí chéngjì hěn hǎo.",
      "example_vi": "Kết quả học tập của anh ấy rất tốt.",
      "link_order": 5,
      "sense_order": 1,
      "target_entry_id": "zh:学习成绩"
    },
    {
      "vi": "học kiến thức",
      "kind": "collocation",
      "lang": "zh",
      "text": "学习知识",
      "example": "我们要学习新知识。",
      "note_vi": null,
      "pattern": "V + N",
      "reading": "wǒmen yào xuéxí xīn zhīshi.",
      "example_vi": "Chúng ta cần học kiến thức mới.",
      "link_order": 1,
      "sense_order": 1,
      "target_entry_id": "zh:学习知识"
    },
    {
      "vi": "học hỏi kinh nghiệm",
      "kind": "collocation",
      "lang": "zh",
      "text": "学习经验",
      "example": "我们要向他学习经验。",
      "note_vi": null,
      "pattern": "V + N",
      "reading": "wǒmen yào xiàng tā xuéxí jīngyàn.",
      "example_vi": "Chúng ta nên học hỏi kinh nghiệm từ anh ấy.",
      "link_order": 4,
      "sense_order": 1,
      "target_entry_id": "zh:学习经验"
    }
  ],
  "sense_labels": [
    {
      "lemma": null,
      "domain": null,
      "register": null,
      "sense_id": "zh:学习:s1",
      "vi_terms": [
        "học",
        "học tập",
        "học hỏi"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": 1
    },
    {
      "lemma": null,
      "domain": null,
      "register": null,
      "sense_id": "zh:学习:s2",
      "vi_terms": [
        "học",
        "học tập",
        "học hỏi"
      ],
      "is_inflection": false,
      "lemma_entry_id": null,
      "core_sense_order": 1
    }
  ]
}

/** `lex.learner_links` rows that point at en:guarantee, as getLearnerBacklinks reads them. */
export const GUARANTEE_BACKLINK_ROWS = [
  {
    "entry_id": "en:warranty",
    "kind": "confusable",
    "vi": null,
    "note_vi": "Guarantee rộng nghĩa hơn, dùng trong mọi ngữ cảnh. Warranty thường chỉ dùng cho sản phẩm hoặc trong pháp lý.",
    "learner_entries": {
      "entries": {
        "lang": "en",
        "headword": "warranty"
      }
    }
  },
  {
    "entry_id": "en:warranty",
    "kind": "synonym",
    "vi": null,
    "note_vi": "Tương đương, dùng phổ biến hơn trong đời thường.",
    "learner_entries": {
      "entries": {
        "lang": "en",
        "headword": "warranty"
      }
    }
  },
  {
    "entry_id": "en:warranty",
    "kind": "synonym",
    "vi": null,
    "note_vi": "Dùng rộng hơn, warranty mang tính pháp lý hơn.",
    "learner_entries": {
      "entries": {
        "lang": "en",
        "headword": "warranty"
      }
    }
  },
  {
    "entry_id": "en:warranty",
    "kind": "synonym",
    "vi": null,
    "note_vi": "Nghĩa gần giống, dùng thay thế được trong hầu hết ngữ cảnh về sản phẩm.",
    "learner_entries": {
      "entries": {
        "lang": "en",
        "headword": "warranty"
      }
    }
  }
]

/** The raw senses of en:warranty, as `DictSense`. */
export const WARRANTY_SENSES = [
  {
    "id": "en:warranty#1",
    "pos": "noun",
    "glossVi": null,
    "glossEn": "A guarantee that a certain outcome or obligation will be fulfilled; security.",
    "senseOrder": 1
  },
  {
    "id": "en:warranty#2",
    "pos": "noun",
    "glossVi": null,
    "glossEn": "A legal agreement that was a real covenant and ran with the land: The grantor of a piece of real estate held in freehold, and their heirs, were required to officially guarantee their claim and plead their case for the title. If evicted by someone with a superior claim (paramount title), they were also required to hand over other real estate of equal value in recompense. It has now been replaced by personal covenants and the covenant of warranty.",
    "senseOrder": 2
  },
  {
    "id": "en:warranty#3",
    "pos": "noun",
    "glossVi": null,
    "glossEn": "A covenant, also called the covenant of warranty, whereby the grantor assures the grantee that he or she will not be subject to the claims of someone with a paramount title, thereby guaranteeing the status of the title that is being conveyed.",
    "senseOrder": 3
  },
  {
    "id": "en:warranty#4",
    "pos": "noun",
    "glossVi": null,
    "glossEn": "A legal agreement, either written or oral (an expressed warranty) or implied through the actions of the buyer and seller (an implied warranty), which states that the goods or property in question will be in exactly the same state as promised, such as in a sale of an item or piece of real estate.",
    "senseOrder": 4
  },
  {
    "id": "en:warranty#5",
    "pos": "noun",
    "glossVi": null,
    "glossEn": "A written guarantee, usually over a fixed period, provided to someone who buys a product or item, which states that certain repairs and/or replacement parts will be provided free of charge in case of damage or a defect.",
    "senseOrder": 5
  },
  {
    "id": "en:warranty#6",
    "pos": "noun",
    "glossVi": null,
    "glossEn": "A stipulation of an insurance policy made by an insuree, guaranteeing that the facts of the policy are true and the insurance risk is as stated, which if not fulfilled renders the policy void.",
    "senseOrder": 6
  },
  {
    "id": "en:warranty#7",
    "pos": "noun",
    "glossVi": null,
    "glossEn": "Justification or mandate to do something, especially in terms of one’s personal conduct; warrant.",
    "senseOrder": 7
  },
  {
    "id": "en:warranty#8",
    "pos": "verb",
    "glossVi": null,
    "glossEn": "To warrant; to guarantee.",
    "senseOrder": 8
  }
]

/** `/admin/learner`'s list query for es:casa and zh:学习. */
export const LAYER_LIST_ROWS = [
  {
    "entry_id": "es:casa",
    "status": "published",
    "model": "ag/claude-opus-4-6-thinking",
    "reviewer": null,
    "prompt_version": "pilot-v1",
    "created_at": "2026-09-28T10:42:49.395766+00:00",
    "review": {
      "issues": [],
      "seconds": {
        "seconds": 32.9
      },
      "rejected": []
    },
    "entries": {
      "lang": "es",
      "headword": "casa"
    },
    "learner_senses": [
      {
        "count": 1
      }
    ],
    "learner_links": [
      {
        "count": 15
      }
    ],
    "sense_labels": [
      {
        "count": 4
      }
    ]
  },
  {
    "entry_id": "zh:学习",
    "status": "published",
    "model": "ag/claude-opus-4-6-thinking",
    "reviewer": null,
    "prompt_version": "pilot-v1",
    "created_at": "2026-09-28T10:42:58.283533+00:00",
    "review": {
      "issues": [],
      "seconds": {
        "seconds": 27.1
      },
      "rejected": []
    },
    "entries": {
      "lang": "zh",
      "headword": "学习"
    },
    "learner_senses": [
      {
        "count": 1
      }
    ],
    "learner_links": [
      {
        "count": 16
      }
    ],
    "sense_labels": [
      {
        "count": 2
      }
    ]
  }
]

/** `/admin/learner/es/casa`'s two queries: the layer with its labels, and the raw senses. */
export const CASA_AUDIT_ROW = {
  "entry_id": "es:casa",
  "status": "published",
  "model": "ag/claude-opus-4-6-thinking",
  "reviewer": null,
  "prompt_version": "pilot-v1",
  "created_at": "2026-09-28T10:42:49.395766+00:00",
  "review": {
    "issues": [],
    "seconds": {
      "seconds": 32.9
    },
    "rejected": []
  },
  "entries": {
    "lang": "es",
    "headword": "casa"
  },
  "learner_senses": [
    {
      "vi_terms": [
        "nhà",
        "căn nhà",
        "ngôi nhà"
      ],
      "sense_order": 1
    }
  ],
  "sense_labels": [
    {
      "lemma": null,
      "domain": null,
      "fix_vi": "Nhà, căn nhà, ngôi nhà, nơi ở",
      "fixed_at": null,
      "register": null,
      "sense_id": "es:casa#1",
      "vi_terms": [
        "nhà",
        "căn nhà",
        "ngôi nhà"
      ],
      "fix_reason": "'Tòa nhà' means 'building' in general, not a house for living. Replaced with 'ngôi nhà' which is more accurate.",
      "is_inflection": false,
      "core_sense_order": 1,
      "previous_gloss_vi": null
    },
    {
      "lemma": "casar",
      "domain": null,
      "fix_vi": "Dạng chia của động từ 'casar' (cưới, kết hôn)",
      "fixed_at": "2026-09-28T10:42:49.395766+00:00",
      "register": null,
      "sense_id": "es:casa#2",
      "vi_terms": [
        "cưới",
        "kết hôn"
      ],
      "fix_reason": "Should indicate it is an inflected form, not a standalone meaning.",
      "is_inflection": true,
      "core_sense_order": null,
      "previous_gloss_vi": "cưới, kết hôn"
    },
    {
      "lemma": "casar",
      "domain": null,
      "fix_vi": "Dạng chia ngôi thứ ba số ít, thì hiện tại của 'casar'",
      "fixed_at": "2026-09-28T10:42:49.395766+00:00",
      "register": null,
      "sense_id": "es:casa#3",
      "vi_terms": [
        "cưới",
        "kết hôn"
      ],
      "fix_reason": "Should specify the grammatical form (third-person singular present indicative).",
      "is_inflection": true,
      "core_sense_order": null,
      "previous_gloss_vi": "cưới, kết hôn"
    },
    {
      "lemma": "casar",
      "domain": null,
      "fix_vi": "Dạng mệnh lệnh ngôi thứ hai số ít của 'casar' (hãy cưới)",
      "fixed_at": "2026-09-28T10:42:49.395766+00:00",
      "register": null,
      "sense_id": "es:casa#4",
      "vi_terms": [
        "hãy cưới",
        "hãy kết hôn"
      ],
      "fix_reason": "Should specify the grammatical form (second-person singular imperative).",
      "is_inflection": true,
      "core_sense_order": null,
      "previous_gloss_vi": "hãy cưới, hãy kết hôn"
    }
  ]
}

export const CASA_SENSE_ROWS = [
  {
    "id": "es:casa#1",
    "sense_order": 1,
    "pos": "noun",
    "gloss_en": "house",
    "gloss_vi": "Nhà ở, căn nhà, tòa nhà; chỗ ở."
  },
  {
    "id": "es:casa#2",
    "sense_order": 2,
    "pos": "verb",
    "gloss_en": "inflection of casar:",
    "gloss_vi": "Dạng chia của động từ 'casar' (cưới, kết hôn)"
  },
  {
    "id": "es:casa#3",
    "sense_order": 3,
    "pos": "verb",
    "gloss_en": "third-person singular present indicative",
    "gloss_vi": "Dạng chia ngôi thứ ba số ít, thì hiện tại của 'casar'"
  },
  {
    "id": "es:casa#4",
    "sense_order": 4,
    "pos": "verb",
    "gloss_en": "second-person singular imperative",
    "gloss_vi": "Dạng mệnh lệnh ngôi thứ hai số ít của 'casar' (hãy cưới)"
  }
]

/** The senses of en:dog as the word page reads them. */
export const DOG_SENSES = [
  {"pos": "noun", "glossVi": "Con chó", "glossEn": "The species Canis familiaris (sometimes designated Canis lupus familiaris), domesticated for thousands of years and of highly variable appearance because of human breeding.", "senseOrder": 1, "id": "en:dog#1", "senseFrequency": 1, "glossViIsMt": false},
  {"pos": "noun", "glossVi": "Theo ai nhằng nhẵng", "glossEn": "Any member of the family Canidae, including domestic dogs, wolves, coyotes, jackals, and their relatives (extant and extinct).", "senseOrder": 2, "id": "en:dog#3", "senseFrequency": null, "glossViIsMt": false},
  {"pos": "noun", "glossVi": "Chó đực, con đực", "glossEn": "A male dog, wolf, or fox, as opposed to a bitch or vixen.", "senseOrder": 3, "id": "en:dog#4", "senseFrequency": 2, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Thịt chó", "glossEn": "The meat of this animal, eaten as food.", "senseOrder": 4, "id": "en:dog#5", "senseFrequency": 3, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Gái xấu, phụ nữ xấu xí", "glossEn": "A dull, unattractive girl or woman.", "senseOrder": 5, "id": "en:dog#6", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Gã, thằng, anh chàng", "glossEn": "A man, guy, chap.", "senseOrder": 6, "id": "en:dog#7", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Kẻ đê tiện, kẻ hèn hạ, kẻ tồi tệ", "glossEn": "Someone who is cowardly, worthless, or morally reprehensible.", "senseOrder": 7, "id": "en:dog#8", "senseFrequency": 4, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Kẻ hám gái, kẻ lăng nhăng", "glossEn": "A sexually aggressive man.", "senseOrder": 8, "id": "en:dog#9b9f2b1a5e", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Chốt kẹp, móc giữ, ngàm giữ", "glossEn": "Any of various mechanical devices for holding, gripping, or fastening something, particularly with a tooth-like projection.", "senseOrder": 9, "id": "en:dog#9", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Cóc hãm, chốt chặn", "glossEn": "A click or pallet adapted to engage the teeth of a ratchet wheel, to restrain the back action.", "senseOrder": 10, "id": "en:dog#317a15f4f7", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Giá đỡ củi", "glossEn": "A metal support for logs in a fireplace.", "senseOrder": 11, "id": "en:dog#10", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Đinh cóc, đinh kẹp ray", "glossEn": "A double-ended side spike driven through a hole in the flange of a rail on a tramway.", "senseOrder": 12, "id": "en:dog#46889e6926", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Lá bài Con Chó", "glossEn": "The eighteenth Lenormand card.", "senseOrder": 13, "id": "en:dog#4d156e8049", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Bánh mì xúc xích, xúc xích", "glossEn": "A hot dog: a frankfurter, wiener, or similar sausage; or a sandwich made from this.", "senseOrder": 14, "id": "en:dog#11", "senseFrequency": 5, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Kẻ yếu thế, người yếu thế", "glossEn": "An underdog.", "senseOrder": 15, "id": "en:dog#734f4e1449", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Bàn chân, ngón chân", "glossEn": "Foot; toe.", "senseOrder": 16, "id": "en:dog#6f3b8d66aa", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Điện thoại", "glossEn": "(from \"dog and bone\") Phone or mobile phone.", "senseOrder": 17, "id": "en:dog#5aaac551ee", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Cọc tiêu", "glossEn": "One of the cones used to divide up a racetrack when training horses.", "senseOrder": 18, "id": "en:dog#8a8513bdf4", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Thứ kém cỏi, phế phẩm", "glossEn": "Something that performs poorly.", "senseOrder": 19, "id": "en:dog#12", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Phim xịt, bom xịt", "glossEn": "A flop; a film that performs poorly at the box office.", "senseOrder": 20, "id": "en:dog#adab714920", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Búa súng, búa đập", "glossEn": "A cock, as of a gun.", "senseOrder": 21, "id": "en:dog#9224317cba", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "noun", "glossVi": "Cáo đực", "glossEn": "A dance having a brief vogue in the 1960s in which the actions of a dog were mimicked.", "senseOrder": 22, "id": "en:dog#2", "senseFrequency": null, "glossViIsMt": false},
  {"pos": "verb", "glossVi": "Đuổi theo, săn đuổi, truy đuổi", "glossEn": "To pursue with the intent to catch.", "senseOrder": 23, "id": "en:dog#13", "senseFrequency": 1, "glossViIsMt": true},
  {"pos": "verb", "glossVi": "Đeo bám, bám theo, quấy rối", "glossEn": "To follow in an annoying or harassing way.", "senseOrder": 24, "id": "en:dog#14", "senseFrequency": 2, "glossViIsMt": true},
  {"pos": "verb", "glossVi": "Chốt chặt, đóng chặt", "glossEn": "To fasten a hatch securely.", "senseOrder": 25, "id": "en:dog#15", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "verb", "glossVi": "Làm tình nơi công cộng", "glossEn": "To watch, or participate, in sexual activity in a public place.", "senseOrder": 26, "id": "en:dog#19ea333657", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "verb", "glossVi": "Làm việc cầm chừng, câu giờ", "glossEn": "To intentionally restrict one's productivity as employee; to work at the slowest rate that goes unpunished.", "senseOrder": 27, "id": "en:dog#aec5590d08", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "verb", "glossVi": "Chỉ trích, chê bai", "glossEn": "To criticize.", "senseOrder": 28, "id": "en:dog#14cdb99e56", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "verb", "glossVi": "Chia ca trực", "glossEn": "To divide (a watch) with a comrade.", "senseOrder": 29, "id": "en:dog#368fec7e88", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "adjective", "glossVi": "Rất tệ, dở tệ", "glossEn": "Of inferior quality; very bad.", "senseOrder": 30, "id": "en:dog#16", "senseFrequency": 1, "glossViIsMt": true},
]

/** The senses of es:casa as the word page reads them, with the MT flags read on 2026-09-29. */
export const CASA_SENSES = [
  {"pos": "noun", "glossVi": "Nhà ở, căn nhà, tòa nhà; chỗ ở.", "glossEn": "house", "senseOrder": 1, "id": "es:casa#1", "senseFrequency": null, "glossViIsMt": false},
  {"pos": "verb", "glossVi": "Dạng chia của động từ 'casar' (cưới, kết hôn)", "glossEn": "inflection of casar:", "senseOrder": 2, "id": "es:casa#2", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "verb", "glossVi": "Dạng chia ngôi thứ ba số ít, thì hiện tại của 'casar'", "glossEn": "third-person singular present indicative", "senseOrder": 3, "id": "es:casa#3", "senseFrequency": null, "glossViIsMt": true},
  {"pos": "verb", "glossVi": "Dạng mệnh lệnh ngôi thứ hai số ít của 'casar' (hãy cưới)", "glossEn": "second-person singular imperative", "senseOrder": 4, "id": "es:casa#4", "senseFrequency": null, "glossViIsMt": true},
]

/** The senses of zh:打 as the word page reads them, with the MT flags read on 2026-09-29. */
export const DA_SENSES = [
  {"pos": null, "glossVi": "Đánh, đập", "glossEn": "to hit; to strike", "senseOrder": 1, "id": "zh:打:s3", "senseFrequency": null, "glossViIsMt": true},
  {"pos": null, "glossVi": "Đánh nhau, chiến đấu", "glossEn": "to fight", "senseOrder": 2, "id": "zh:打:s4", "senseFrequency": null, "glossViIsMt": true},
  {"pos": null, "glossVi": "Đánh, làm, gọi", "glossEn": "(in many expressions) a semantically light transitive verb used with various objects to form expressions with a wide range of meanings, e.g. 打傘|打伞[da3 san3] \"to hold an umbrella\", 打電話|打电话[da3 dian4 hua4] \"to make a phone call\", 打針|打针[da3 zhen1] \"to get an injection\"", "senseOrder": 3, "id": "zh:打:s5", "senseFrequency": null, "glossViIsMt": true},
  {"pos": null, "glossVi": "Từ", "glossEn": "(coll.) from; since", "senseOrder": 4, "id": "zh:打:s6", "senseFrequency": null, "glossViIsMt": true},
  {"pos": null, "glossVi": "Tá (12 cái)", "glossEn": "(loanword) dozen", "senseOrder": 5, "id": "zh:打:s1", "senseFrequency": null, "glossViIsMt": true},
  {"pos": null, "glossVi": "Đánh, đập", "glossEn": "Taiwan pr. [da3]", "senseOrder": 6, "id": "zh:打:s2", "senseFrequency": null, "glossViIsMt": true},
]
