# frozen_string_literal: true

# What a long render does to the rest of the process.
#
# The gem documents that a render in one thread does not block the others, and
# a documented concurrency claim that nothing executes is a claim nobody has
# checked. Fiddle releases the GVL around a foreign call unless a function is
# declared `need_gvl: true` — which this binding never does — so the assertion
# below is what that reduces to from an application's point of view.
RSpec.describe "concurrency", :aggregate_failures do
  # Enough content that one render is long enough to observe, without making
  # the suite slow: the ticker only has to get a turn. Items rather than a
  # repeat grid, because the point is the duration of one foreign call and a
  # flat list is the least wire to get wrong.
  def long_document
    items = (1..400).map do |n|
      "- id: line#{n}\n  type: text\n  box: { x: 0, y: 0, w: 400, h: 16 }\n  " \
        "text: \"Line item #{n}\"\n"
    end
    client.generate_source(template: source_template(items.join), params: {})
  end

  it "lets other Ruby threads run while a render is in flight" do
    ticks = 0
    ticker = Thread.new do
      loop do
        ticks += 1
        sleep 0.001
      end
    end
    sleep 0.05
    before = ticks

    result = long_document

    during = ticks - before
    ticker.kill

    expect(result).to be_success
    # A thread that never ran would score zero; the margin is wide because
    # this asserts "the GVL was released", not a scheduling rate.
    expect(during).to be > 5
  end
end
