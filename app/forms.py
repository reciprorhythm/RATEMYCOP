from flask_wtf import FlaskForm
from wtforms.fields import StringField, SubmitField, DateTimeLocalField, TextAreaField, HiddenField
from wtforms.validators import DataRequired
from datetime import datetime

class ReportForm(FlaskForm):
    repoID = HiddenField()
    repoTitle = StringField('Title', validators=[DataRequired()])
    repoLoca = StringField('Location', validators=[DataRequired()])
    repoCont = TextAreaField('Description', validators=[DataRequired()])
    repoTime = DateTimeLocalField(format="%Y-%m-%dT%H:%M:%S", default=datetime.today)
    repoCop = StringField('Tag Officers')
    submit = SubmitField('SUBMIT REPORT')
