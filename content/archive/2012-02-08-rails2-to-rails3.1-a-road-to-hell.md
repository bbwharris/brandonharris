---
categories:
- rails
date: 2012-02-08T00:00:00Z
title: 'Rails 2 to Rails 3.1 : A Road to Hell'
url: /2012/02/08/rails2-to-rails3.1-a-road-to-hell/
---

Some say that the road to hell is paved with good intentions. For a recent project for a client, we decided to upgrade their aging app from 2.3.14 to 3.1.3. Why? A lot of the plugins and gems that we were using were getting stale, and it was getting harder and harder to support the aging setup.

I set out my journey with the fantastic [rails\_upgrade](https://github.com/rails/rails_upgrade) plugin. I had done several upgrades in the past, and I knew a lot of the pitfalls, but I wasn't quite prepared for what I was about to discover.

#### Step 1: Dive in.

My first discovery was the use of an unconventional routing technique in Rails 2.

```ruby
# ...

map.resources :pages,
  :path_prefix => "/parents/:parent_id",
  :name_prefix => "parent_",
  :collection => {
    :options => :get,
    :ajaxy => :get
  }

# ...
```

Which in Rails 3 is translated to:

```ruby
# ...

resources :parents do
  resources :pages do
    collection do
      get :options
      get :ajaxy
    end
  end  
end

# ...
```

This was far trickier than I thought, there were a lot of routes in this application, and the test coverage was under 50%. I shrugged and translated the routes as best as I could and moved on.

#### Getting in the Flow

For years this application had used [Restful Authentication](https://github.com/technoweenie/restful-authentication), which in its day was the de facto authorization system in use by everyone developing in Rails. Since my goal was to modernize the application, the decision was made to convert to [Devise](https://github.com/plataformatec/devise)

My expectation was that this was going to be painful. Fortunately, [the community saved me](https://github.com/plataformatec/devise/wiki/How-To:-Migrate-from-restful_authentication-to-Devise). My confidence grew, this was possible and I was only on day 1. I'd have this thing knocked out in a week.

#### Roadblock

Remember all of those awesome helpers in Rails 2? Like link\_to\_remote, form\_remote\_tag? They performed convenient javascript on your behalf? This app was FULL of those. Not only that, but there was a horrendous amount of javascript mixed into the logic. Im talking rjs kind of stuff.

Luckily, this app was in a transition state from Prototype to jQuery. This ended up helping in very heavy js interface areas.

I spent 3 weeks removing and changing and testing all of this stuff. The typical change would look like the following:

```ruby
# Rails 2 with inline js help
# controller
render :update do |page|
  page.replace_html 'some_dom_id', :partial => 'some_partial'
end
```

```ruby
# In the controller
#...
respond_to :html, :js
#...
```

```ruby
<%# in update.js.erb %>
html = '<%= escape_javascript(render :partial => 'some_partial') %>'
$('#some_dom_id').html(html);
```

Now I realize that there are a lot of ways to do this, but you need to understand this pattern was repeated everywhere. Each with different dom id's, and slightly different logic. Some would be triggered by external ajax, others by inline link\_to\_remote calls.

It was insane, tedious, and the bulk of it was missing complete testing.

The astute reader will also understand that the call to invoke these methods had changed in the Rails API. Remember link\_to\_remote and form\_remote\_tag mentioned previously. Check. Have you also noticed that the link\_to API has changed? Check. Have you also noticed that the form\_for API has changed? You no longer do form\_for :object, @object, it's just form\_for @object.

Those were all minor, but I learned to develop a real fear for using these helpers. They had once been the correct way to develop, and now have been completely deprecated.

#### Lessons Learned

Here are some development guidelines that I believe are useful to a lot of Rails developers. At the very least, the next person will be very happy when they are faced with the "next big upgrade"

##### Plugins

These are thankfully going to be phased out in place of gems in the upcoming version of Rails. Generally, I would avoid plugins at all costs. It is too easy to monkey patch your project to obtain a single feature that you could probably throw into a module yourself.

##### Gems

When you choose a gem, you are choosing to hinge the future of your app development on that gem. Without even knowing it, you can mix in that gems api into your app in multiple ways. When that gem turns into a ghost town, you are leaving a lot of technical debt behind. Choose your gems carefully. They need to grow with your app, and you need to keep your app in step with those gems.

##### Helpers/Convenience/Sugar/Magic

No! Stick to the absolute simplest form of an element. Why use link\_to when you can write your own link? Really think about why in this situation it is better to use link\_to (sometimes it is).

Avoid cool conveniences that you don't understand. RJS was cool, but a good front end developer was probably uneasy when they first saw it. We have come a looong way in the javascript that we put in our apps these days.

##### Forked Gems with Custom Functionality

Never. If you must, then your feature could probably be used by the upstream developers. Fork, change, pull request. If your feature is so specific, then you should be writing a custom library. Never keep a forked gem in your project, it will not be maintained, and will be an absolute nightmare for the next developer.

As a developer, write tests, and keep everything up to date. You will be happier, and future teams will be happier. Don't be afraid to delete code and rewrite it. We have a magic profession where our clay is always ready to be molded.
