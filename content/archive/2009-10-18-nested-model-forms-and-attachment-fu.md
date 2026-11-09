---
categories:
- rails
date: 2009-10-18T00:00:00Z
title: Nested Model Forms and attachment_fu
url: /2009/10/18/nested-model-forms-and-attachment-fu/
---

I think that a lot of Rails developers have moved on to [Paperclip](http://www.thoughtbot.com/projects/paperclip/) . Most of us started with [attachment\_fu](http://github.com/technoweenie/attachment_fu) , and I am willing to wager that we still have projects floating around using attachment\_fu.

I updated one of these older projects to 2.3.4, and created a new form utilizing the built in nested form handling as of 2.3.

My models look like this:

```ruby
class Article < ActiveRecord::Base
  has_one :report
  accepts_nested_attributes_for :report
end

class Report < ActiveRecord::Base
  belongs_to :article
  has_attachment(
    :storage => :file_system,
    :file_system_path => 'public/reports',
    :max_size => 2.megabytes,
    :content_type => 'application/pdf'
  )
  validates_as_attachment
end
```

The idea is that an article can have a pdf attachment. The view code for the nested form should look like this:

```erb
 <%form_for :article, :url => admin_articles_url, :html => {:multipart => true} do |f| %>
    <%=f.label :title%>
    <%=f.text_field :title%>
    ...
    <%f.fields_for :report do |e|%>
      <%=e.label :report %>
      <%=e.file_field :uploaded_data%>
    <%=f.submit 'Create'%>
  <%end%>
```

Then in your parameters, you should see params[:article][:report\_attributes], and by having accepts\_nested\_attributes in the Article model, Rails takes care of the rest.

However, I received this error:

```ruby
Report(#70166977052900) expected, got HashWithIndifferentAccess(#70167015178720)
```

I google around, and found this [thread](http://www.ruby-forum.com/topic/179926) which doesn’t provide a solution, in fact no where could I find the solution. So I did some of my own digging, and I noticed that my parameters looked like this:

params[:article] and params[:report]

I wasn’t seeing the expected:

params[:article][:report\_attributes]

So given this information, I tried this:

```erb
  <%form_for :article, :url => admin_articles_url, :html => {:multipart => true} do |f| %>
    <%=f.label :title%>
    <%=f.text_field :title%>
    ...
    <%f.fields_for :report_attributes do |e|%>
      <%=e.label :report %>
      <%=e.file_field :uploaded_data%>
    <%=f.submit 'Create'%>
  <%end%>
```

Voila! Problem solved. I haven’t dug into the code for Rails and Attachment\_Fu to see why this needs to be done, but if you are having this problem and need it fixed, just append “\_attributes” to your nested child model name in the view.
