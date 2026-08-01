# SYNTHETIC SAMPLE — hand-authored for the Shojiku migration walkthrough
# (docs/migration-thinreports.md). This stands in for the Ruby host code that
# fills a legacy Thinreports layout: it is not real production code, nothing in
# this repository runs or parses it, and its data is fictional 正直堂 sample
# content.
#
# It is written the way legacy report hosts usually are, on purpose — that is
# what the migration has to read:
#   * the data dictionary lives HERE, not in the .tlf (the layout only has ids);
#   * every DISPLAY VARIANT of a date or a price is pre-materialized as its own
#     key, because the template cannot pick a format (`reserved_at_jp`,
#     `reserved_at_date`, `price_total_yen`, …) — the "format-key explosion";
#   * numbers are formatted into strings in Ruby, so the report receives text
#     and no longer knows what was a number.

require 'thinreports'

# One reserved book row.
BookRow = Struct.new(:title, :author, :price, :arrived, keyword_init: true)

class PickupSlipReport
  LAYOUT = File.join(__dir__, 'pickup_slip.tlf')

  WDAYS = %w[日 月 火 水 木 金 土].freeze

  def initialize(reservation)
    @reservation = reservation
  end

  def build
    report = Thinreports::Report.new(layout: LAYOUT)
    report.start_new_page do |page|
      values.each { |id, value| page.item(id).value(value) if page.list?(id) == false }
      @reservation[:books].each do |book|
        page.list(:reserved_books).add_row(book_row_values(book))
      end
    end
    report
  end

  private

  # The slip's data dictionary — implicit, and only discoverable by reading it.
  def values
    r = @reservation
    {
      order_reservation_number: r[:number],

      # One logical field, four keys: the layout can only print strings, so the
      # host decides every variant up front and the caller must keep them in
      # sync by hand.
      reserved_at: r[:reserved_at],
      reserved_at_jp: format_jp_date(r[:reserved_at]),
      reserved_at_date: r[:reserved_at].strftime('%Y/%m/%d'),

      customer_name: r[:customer][:name],
      customer_member_number: "会員番号 #{r[:customer][:member_number]}",
      customer_tel: "TEL #{r[:customer][:tel]}",

      # Same explosion again, twice over, for the pickup window.
      pickup_schedule_from: r[:pickup_from],
      pickup_schedule_from_jp: format_jp_date(r[:pickup_from]),
      pickup_schedule_to: r[:pickup_to],
      pickup_schedule_to_jp: format_jp_date(r[:pickup_to]),
      pickup_deadline_notice: "#{format_jp_date(r[:pickup_to])}まで店頭でお預かりします。",
      pickup_branch: "お引取店舗: #{r[:branch]}",

      # A count and a total, already turned into display strings.
      reserved_books_count: "#{r[:books].size}点",
      price_total_yen: "¥#{comma(r[:books].sum { |b| b[:price] })}",

      notice_line_2: "・お引取期限は #{format_jp_date(r[:pickup_to])} です。",

      printed_at_datetime: Time.now.strftime('%Y/%m/%d %H:%M 印刷')
    }
  end

  def book_row_values(book)
    {
      book_title: book[:title],
      book_author: book[:author],
      # Formatted in Ruby again — the layout receives "¥1,980", not 1980.
      book_price_yen: "¥#{comma(book[:price])}",
      book_status_label: book[:arrived] ? '' : '（入荷待ち）'
    }
  end

  def format_jp_date(date)
    "#{date.year}年#{date.month}月#{date.day}日(#{WDAYS[date.wday]})"
  end

  def comma(number)
    number.to_s.reverse.scan(/\d{1,3}/).join(',').reverse
  end
end
