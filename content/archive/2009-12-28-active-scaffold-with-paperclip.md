---
categories:
- rails
- active scaffold
date: 2009-12-28T00:00:00Z
title: Active Scaffold with Paperclip
url: /2009/12/28/active-scaffold-with-paperclip/
---

I always recommend [Active Scaffold](http://activescaffold.com/) to fellow Rails developers. There is a learning curve, but it can cut a lot of development time out of your clients custom CMS.

[Paperclip](http://github.com/thoughtbot/paperclip) has pretty much dominated the Rails attachment market for the past year. My company has migrated to it, and there are countless tutorials and testimonials regarding it’s ease of use.

I am assuming that you are using the latest version of Rails (2.3.5 as of this writing), Active Scaffold, and Paperclip. First we will install all the necessary components, then we will configure the rails app.

Install Active Scaffold:

```bash
script/plugin install git://github.com/activescaffold/active_scaffold.git
```

Active Scaffold is big so this takes a while.

Install Paperclip:

```bash
script/plugin install git://github.com/thoughtbot/paperclip.git
```

*As of 6/14/2010 this is no longer needed, the bridge has been moved to the core*  
~~Install the Active Scaffold Paperclip Bridge:~~

Lets create a basic person model:

```bash
script/generate model Person
```

To create controllers in the admin namespace, I don’t use the rails controller generator. I don’t like cluttering up my projects with files I will never use, since I employ Active Scaffold for 99% of my admin interfaces. This is my personal preference, you may do this anyway that you wish.

```bash
mkdir app/controllers/admin && touch app/controllers/admin/people_controller.rb
```

Lets configure the “Person” migration for paperclip.

```ruby
class CreatePeople < ActiveRecord::Migration
  def self.up
    create_table :people do |t|
      t.string :name, :avatar_file_name, :avatar_content_type
      t.integer :avatar_file_size
      t.datetime :avatar_updated_at
      t.timestamps
    end
  end

  def self.down
    drop_table :people
  end
end
```

Configure the Person model to accept the paperclip attachment.

```ruby
class Person < ActiveRecord::Base
  has_attached_file :avatar, :styles => {:thumbnail => "75x75#"}
end
```

Setup your routing for the admin namespaced “People” controller.

```ruby
ActionController::Routing::Routes.draw do |map|
  map.namespace :admin do |admin|
    admin.resources :people, :active_scaffold => true
  end
  map.connect ':controller/:action/:id'
  map.connect ':controller/:action/:id.:format'
end
```

Create a layout file for admin, I use Haml, and I recommend that you do too.

```haml
!!!STRICT
%html{'xmlns' => "http://www.w3.org/1999/xhtml", :lang => "en"}
  %head
    = javascript_include_tag :defaults
    = active_scaffold_includes
  %body
    #content
      = yield
```

Finally, configure your active scaffolded controller. The key here is to include the attachment model name, in this case “avatar”.

```ruby
class Admin::PeopleController < ApplicationController
  layout 'admin'
  active_scaffold :person do |config|
    #restrict all columns to these three
    config.columns = [:name, :avatar]

    #include multipart for create and update forms
    config.create.multipart = true
    config.update.multipart = true
  end
end
```

When you are done you can go to “/admin/people” and you will be greeted with the familiar active scaffold interface. Create a new Person and upload the avatar to be used for that Person.

You should download the source for this from my git repo [here.](http://github.com/bbwharris/examples/tree/master/as_paperclip/)
