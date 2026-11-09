---
categories:
- rails
date: 2009-07-07T00:00:00Z
title: Why aren't you using Active Scaffold?
url: /2009/07/07/why-arent-you-using-active-scaffold/
---

I do a lot of work creating admin interfaces in rails. A lot of it is redundant, so it would be nice to use a canned solution. [Django](http://www.djangoproject.com/) has an admin interface built into every project. This makes a developers life easier.

I thought “Wouldn’t it be nice to have a plugin that read all my table associations and provided a simple crud interface?”

That is exactly what [Active Scaffold](http://activescaffold.com/) tries to be.

How cool is active scaffold? Well, let’s pretend that we want to create the following tables:

```ruby
class CreatePeople < ActiveRecord::Migration
  def self.up
    create_table :people do |t|
      t.string :first_name, :last_name, :zip_code
      t.integer :title_id
      t.timestamps
    end
  #... and so on ...
  end  

class CreateTitles < ActiveRecord::Migration
  def self.up
    create_table :titles do |t|
     t.string :title
     t.timestamps
   end
end
```

Let's setup the following relationship in the Person model:

```ruby
class Person < ActiveRecord::Base
  belongs_to :title
end
```

We would have to write views for People and for Titles to create a robust and useful admin interface. With Active Scaffold you only have to do the following:

1. Include default javascript and active scaffold includes in the layout file:

2. Add the following to your people\_controller and your title\_controller respectively:

```erb
<%=javascript_include_tag :defaults %>
<%=active_scaffold_includes %>
```

And your done! ActiveScaffold takes care of the rest. The more skeptical among your are sneering right now, “what if I want to change the way the form is laid out, or what if I want to select a field from the title model instead of selecting an object….” You can do all of this with active scaffold and it isn’t super difficult.

To set the column order and have title appear as a drop down:

```ruby
class TitlesController < ApplicationController
  active_scaffold :titles
end

class PeopleController < ApplicationController
  active_scaffold :people
end
```

I recently had a record that was nested inside another record (such as title is nested inside people here) that had more columns than the horizontal space allowed. Since Active Scaffold uses ajax, a scrollbar wasn’t an option, so I found this:

```ruby
active_scaffold :nested do |config|
  config.subform.layout = :vertical
end
```

This sets this form vertical instead of horizontal in all forms that it belongs to. (That’s a mouthful).

Check it out, I am sure that you will find it useful.
