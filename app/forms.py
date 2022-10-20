from flask_wtf import FlaskForm
from wtforms.fields import StringField, BooleanField, SubmitField, DateTimeLocalField, TextAreaField, MultipleFileField, SelectMultipleField, HiddenField
from wtforms.validators import DataRequired
from datetime import datetime

class ReportForm(FlaskForm):
    postID = HiddenField()
    postTime = DateTimeLocalField(format="%Y-%m-%dT%H:%M:%S", default=datetime.today)
    title = StringField('Title', validators=[DataRequired()])
    location = StringField('Location', validators=[DataRequired()])
    datetime = DateTimeLocalField('Date and Time', format="%Y-%m-%dT%H:%M")
    eviUp = MultipleFileField('Evidence')
    descrip = TextAreaField('Description', validators=[DataRequired()])
    depTag = SelectMultipleField('Tag Police Departments', choices=[('City Of Toronto – Police Service', 'TPS'),("Ontario Provincial Police", 'OPP'), ('City Of Ottawa – Police Services', 'OPS')])
    copTag = StringField('Tag Officers')
    cw = StringField('Content Warnings') 
    escDesc = SelectMultipleField('Escalated/Descalated', choices=[('Escalated', 'Escalated'),('Descalated', 'Descalated')])
    submit = SubmitField('SUBMIT REPORT')

   