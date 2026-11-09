---
categories:
- programming
- rails
date: 2009-05-18T00:00:00Z
title: Populate Object Instance Variables From Hash
url: /2009/05/18/populate-object-instance-variables-from-hash/
---

I recently needed to write a class in ruby that I wanted to behave similarly to an ActiveRecord based class, but without the database ties. Particularly, I wanted to do this:

```ruby
r = Record.new({:attribute1 => "a", :attribute2 => "b"})
```

It’s not too hard to hard code a simple class with attributes that are defined by a Hash, but in the pursuit of elegance, I wanted it to be more generic. I pulled up this little snippet:

```ruby
  attributes.each do |k, v|
    if k.include?("(")
      multi_parameter_attributes << [ k, v ]
    else
      respond_to?(:"#{k}=") ? send(:"#{k}=", v) : raise(UnknownAttributeError, "unknown attribute: #{k}")
    end
  end
```

This is your most basic metaprogramming technique in ruby. Check if the object responds to the message, and if so, set it.

Below is all that I needed to accomplish my task:

```ruby
  def initialize(attributes={})
    attributes.each do |k,v|
      respond_to?(:"#{k}=") ? send(:"#{k}=", v) : raise(NoMethodError, "Unknown method #{k}, add it to the record attributes")
    end
  end
```
