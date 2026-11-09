---
categories:
- rails
- oracle
- ubuntu
date: 2010-06-14T00:00:00Z
title: Oracle, Rails and Ubuntu 10.04
url: /2010/06/14/oracle-rails-and-ubuntu-10-04/
---

I recently setup an Ubuntu based server that needed ruby to talk to oracle and mysql. If you are a rails developer, you should be familiar with mysql, but what about Oracle? It isn’t quite as straightforward as you might assume, but it is within the grasp of mere mortals. Please keep in mind that due to changing version numbers, all version numbers are replaced with \*. It is up to the reader to properly translate the following commands. Don’t simply copy and paste. I am making the assumption that you are installing on Ubuntu 10.04 (Lucid Lynx) and you are using the 64-bit version.

First Go to:  
<http://www.oracle.com/technology/software/tech/oci/instantclient/htdocs/linuxx86_64.html>

Select the latest versions of:

```bash
oracle-instantclient*-basiclite-*.rpm
oracle-instantclient*-sqlplus-*.rpm
instantclient-sdk-*.zip
```

Replace the \* above with the appropriate latest version number.

Now you will need to install the alien package management tool. It converts .rpm to .deb and works amazingly well most of the time.

```bash
sudo apt0get install alien
```

Now run the alien command on the rpms you downloaded from oracle:

```bash
sudo alien oracle-instantclient*-basiclite-*.rpm
sudo alien oracle-instantclient*-sqlplus-*.rpm
```

This will produce .deb files in your current directory. To install the freshly minted pacakges run:

```bash
sudo dpkg -i oracle-instantclient-*.deb
```

Now unzip the sdk contents, you need to extract the header files for everything to work later.

```bash
unzip instantclient-sdk-*
cd instantclient-sdk-*/include/
cp *.h /usr/include/oracle//client64/lib
```

If you are going to be using the tnsnames.ora file to specify your connections, you will need to set the TNS\_ADMIN environment variable. In Debian based distros, you will want to edit /etc/environment. Editing this file ensures that environment variables are set for all users.

Add the following environment variables to your /etc/environment file.

```bash
LD_LIBRARY_PATH=/usr/lib/oracle//client64/lib
TNS_ADMIN="your path to your tnsnames.ora file"
```

You are all set for interacting with oracle from your Ubuntu server. To test just run:

```bash
sqlplus64
```

If you would like to enable your rails app to use oracle as well you have a few more steps.

```bash
sudo gem install ruby-oci8
```

If that fails, you may need to specify to LD\_LIBRARY\_PATH:

```bash
sudo gem install LD_LIBRARY_PATH=$LD_LIBRARY_PATH ruby-oci8
```

Pay close attention to errors if you receive them, they are actually very clear and coherent. Pay close attention to your environment variables and the inclusion of the header files.

If you have reached this point you can test your oci8 connection:

```ruby
irb
irb(main):001:0>require 'rubygems'
=> true
irb(main):002:0>require 'oci8'
=> true
irb(main):003:0>oracle_connection = OCI8.new(user,password,schema)
=> #
irb(main):004:0> oracle.exec("select 1 from dual")
=> #
```

Now if you are planning on using Ruby on Rails with Oracle, you will need to install the activerecord adapter. I used the [enhanced adapter](http://github.com/rsim/oracle-enhanced), but the choice is yours.

```bash
sudo gem install activerecord-oracle_enhanced-adapter
```

Now the final part, your database.yml file should look like the following:

```ruby
production: 
  adapter: oracle_enhanced 
  database: 
  username: 
  password:
```

The oracle enhanced adapter has some more config options for your database.yml file, please refer to:  
<http://wiki.github.com/rsim/oracle-enhanced/>
