from django.conf.urls import patterns, url
from planner import views

urlpatterns = patterns('',
                       url(r'^$', views.index, name='index'),
)