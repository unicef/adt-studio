export const ALL_TEXT_TYPES = [
  "book_title", "book_subtitle", "book_author", "book_metadata",
  "section_heading", "section_text", "instruction_text",
  "activity_number", "activity_title", "activity_option",
  "activity_input_placeholder_text", "fill_in_the_blank",
  "image_associated_text", "image_overlay", "math",
  "standalone_text", "header_text", "footer_text", "page_number", "other",
]

export const RENDER_TYPES = ["llm", "template", "activity"] as const

export const ALL_SECTION_TYPES = [
  "front_cover", "inside_cover", "back_cover", "separator", "credits",
  "foreword", "table_of_contents", "boxed_text",
  "text_only", "text_and_single_image", "text_and_images", "images_only",
  "activity_matching", "activity_fill_in_a_table", "activity_multiple_choice",
  "activity_true_false", "activity_open_ended_answer",
  "activity_fill_in_the_blank", "activity_sorting", "other",
]
