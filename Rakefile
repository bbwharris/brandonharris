desc 'Generate tags page'
task :tags do
  puts "Generating tags..."
  require 'rubygems'
  require 'jekyll'
  include Jekyll::Filters

  options = Jekyll.configuration({})
  site = Jekyll::Site.new(options)
  site.read_posts('')
  site.categories.sort.each do |category, posts|
    html = ''

    html << <<-HTML
---
  layout: default 
---
{% for post in site.categories.#{category} %}
  {% include post.html %}
{% endfor %}
HTML
    File.open("tags/#{category}.html", 'w+') do |file|
      file.puts html
    end
  end
  puts 'Done.'
end
