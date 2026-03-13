require 'webrick'
require 'net/http'
require 'uri'
require 'json'

PORT = 8080
DOC_ROOT = ENV['MCAL_ROOT'] || File.dirname(File.expand_path(__FILE__))

server = WEBrick::HTTPServer.new(
  Port: PORT,
  DocumentRoot: DOC_ROOT,
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::INFO),
  AccessLog: [[File.open(File::NULL, 'w'), WEBrick::AccessLog::COMMON_LOG_FORMAT]]
)

# ── API proxy: POST /api/suggest ────────────────────────────
server.mount_proc '/api/suggest' do |req, res|
  res['Content-Type'] = 'application/json'
  res['Access-Control-Allow-Origin'] = '*'
  res['Access-Control-Allow-Headers'] = 'Content-Type'
  res['Access-Control-Allow-Methods'] = 'POST, OPTIONS'

  # Handle CORS preflight
  if req.request_method == 'OPTIONS'
    res.status = 204
    next
  end

  unless req.request_method == 'POST'
    res.status = 405
    res.body = JSON.generate({ error: 'Method not allowed' })
    next
  end

  begin
    body = JSON.parse(req.body)
    api_key = body['apiKey']
    events = body['events'] || []
    categories = body['categories'] || {}
    current_date = body['currentDate'] || Time.now.strftime('%Y-%m-%d')

    unless api_key && !api_key.empty?
      res.status = 400
      res.body = JSON.generate({ error: 'API key is required' })
      next
    end

    # Build the prompt for Claude
    existing_titles = events.map { |e| e['title'] }.join(', ')
    category_list = categories.map { |k, v| "#{k}: #{v['label']} (#{v['icon']})" }.join(', ')

    prompt = <<~PROMPT
      You are helping a record label's marketing team find upcoming events for their 2026 content calendar.

      Their calendar currently includes these events: #{existing_titles}

      Available categories: #{category_list}

      Today's date: #{current_date}

      Suggest 5 relevant upcoming events (after #{current_date}) that are NOT already in the calendar. Focus on:
      - Major music releases, album drops, tours
      - Award shows (Grammys, BRITs, VMAs, etc.)
      - Fashion events (fashion weeks, galas)
      - Film/TV premieres and releases
      - Sports events (F1, football, basketball, tennis)
      - Cultural moments (holidays, awareness months)
      - Gaming releases
      - Music festivals

      The content team creates short-form video edits (phonk edits, fan memes, runway clips, cinematic edits, etc.) so tailor the content ideas to that style.

      Return ONLY a JSON array with exactly this format (no other text):
      [
        {
          "title": "Event Name",
          "startDate": "2026-MM-DD",
          "endDate": "2026-MM-DD",
          "category": "category_key",
          "contentIdeas": "Brief content ideas for short-form edits"
        }
      ]

      Use only these category keys: music, fashion, film, sports, culture, gaming, festival
    PROMPT

    # Call OpenAI API (ChatGPT)
    uri = URI('https://api.openai.com/v1/chat/completions')
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.read_timeout = 30
    http.open_timeout = 10

    api_req = Net::HTTP::Post.new(uri)
    api_req['Content-Type'] = 'application/json'
    api_req['Authorization'] = "Bearer #{api_key}"
    api_req.body = JSON.generate({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that suggests events for a record label marketing calendar. Always respond with only a JSON array, no other text.' },
        { role: 'user', content: prompt }
      ]
    })

    api_res = http.request(api_req)

    unless api_res.is_a?(Net::HTTPSuccess)
      error_body = JSON.parse(api_res.body) rescue { 'message' => api_res.body }
      res.status = api_res.code.to_i
      res.body = JSON.generate({
        error: error_body.dig('error', 'message') || error_body['message'] || 'API request failed'
      })
      next
    end

    api_data = JSON.parse(api_res.body)
    text_content = api_data.dig('choices', 0, 'message', 'content') || '[]'

    # Extract JSON array from response (handle markdown code blocks)
    json_match = text_content.match(/\[[\s\S]*\]/)
    suggestions = json_match ? JSON.parse(json_match[0]) : []

    res.status = 200
    res.body = JSON.generate({ suggestions: suggestions })

  rescue JSON::ParserError => e
    res.status = 400
    res.body = JSON.generate({ error: "Invalid JSON: #{e.message}" })
  rescue Net::OpenTimeout, Net::ReadTimeout
    res.status = 504
    res.body = JSON.generate({ error: 'API request timed out. Please try again.' })
  rescue => e
    res.status = 500
    res.body = JSON.generate({ error: "Server error: #{e.message}" })
  end
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

puts "Marketing Calendar server running on http://localhost:#{PORT}"
server.start
